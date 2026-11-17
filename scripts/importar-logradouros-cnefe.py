import argparse
import csv
import gzip
import io
import json
import re
import subprocess
import time
import unicodedata
import zipfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from statistics import median
from urllib.error import URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

import shapefile
from shapely.geometry import Point, box, shape
from shapely.ops import nearest_points, unary_union


MESH_URL = 'https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2022'
CNEFE_URL = 'https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/Municipio'
FACES_URL = 'https://geoftp.ibge.gov.br/recortes_para_fins_estatisticos/malha_de_setores_censitarios/censo_2022/base_de_faces_de_logradouros_versao_2022_censo_demografico/shp'
PROJECT = Path(__file__).resolve().parent.parent
MAX_STREET_OFFSET = 0.0006


def download(url, cache_path):
    if cache_path.is_file() and cache_path.stat().st_size:
        return cache_path
    for attempt in range(3):
        try:
            request = Request(url, headers={'User-Agent': 'SIGOU (public IBGE address index import)'})
            temporary = cache_path.with_suffix(cache_path.suffix + '.part')
            with urlopen(request, timeout=45) as response:
                with temporary.open('wb') as target:
                    while chunk := response.read(1024 * 1024):
                        target.write(chunk)
                if not temporary.stat().st_size:
                    raise ValueError(f'Arquivo vazio: {url}')
            temporary.replace(cache_path)
            return cache_path
        except (URLError, TimeoutError, ConnectionError) as error:
            if attempt == 2:
                raise RuntimeError(f'Falha ao baixar {url}') from error
            time.sleep(2 ** attempt)


def mesh_records(path, areas):
    with shapefile.Reader(str(path), encoding='utf-8') as reader:
        for record in reader.iterShapeRecords():
            envelope = box(*record.shape.bbox)
            if any(area.intersects(envelope) for area in areas):
                polygon = shape(record.shape.__geo_interface__)
                if any(area.intersects(polygon) for area in areas):
                    yield record.record.as_dict()


def municipalities_in_area(cache, areas):
    states = mesh_records(download(f'{MESH_URL}/Brasil/BR/BR_UF_2022.zip', cache / 'BR_UF_2022.zip'), areas)
    municipalities = []
    for state in states:
        uf = state['SIGLA_UF']
        filename = f'{uf}_Municipios_2022.zip'
        mesh = download(f'{MESH_URL}/UFs/{uf}/{filename}', cache / filename)
        municipalities.extend((row['CD_MUN'], row['NM_MUN'], uf) for row in mesh_records(mesh, areas))
    return sorted(municipalities)


def archive_urls(cache, municipalities):
    urls = {}
    for state in sorted({f'{code[:2]}_{uf}' for code, _, uf in municipalities}):
        directory = f'{CNEFE_URL}/{state}/'
        listing = download(directory, cache / f'{state}.html').read_text(encoding='utf-8', errors='replace')
        for filename, code in re.findall(r'href="((\d{7})_[^"/]*\.zip)"', listing, flags=re.IGNORECASE):
            urls[code] = directory + quote(filename, safe='%')
    missing = [f'{name} ({uf})' for code, name, uf in municipalities if code not in urls]
    if missing:
        raise RuntimeError(f'Arquivos CNEFE ausentes: {", ".join(missing)}')
    return urls


def title(text):
    return ' '.join(
        word.lower() if index and word in {'DA', 'DAS', 'DE', 'DO', 'DOS', 'E'}
        else word if word in {'BR', 'PR', 'SP'} else word.capitalize()
        for index, word in enumerate(text.split())
    )


def street_key(text):
    decomposed = unicodedata.normalize('NFKD', text).casefold()
    ascii_text = ''.join(character for character in decomposed if not unicodedata.combining(character))
    return ' '.join(re.findall(r'[a-z0-9]+', ascii_text))


def named_street(street_type, street_title, name):
    key = street_key(name)
    if not street_type or not key or key.startswith(('sem denom', 'sem nome', 'nao informado')):
        return None
    return title(f'{street_type} {street_title} {name}')


def read_streets(archive_path, code, bounds):
    points_by_street = defaultdict(lambda: defaultdict(set))
    with zipfile.ZipFile(archive_path) as archive:
        csv_name, = (name for name in archive.namelist() if name.lower().endswith('.csv'))
        with archive.open(csv_name) as source:
            rows = csv.DictReader(io.TextIOWrapper(source, encoding='utf-8-sig'), delimiter=';')
            for row in rows:
                if row['COD_MUNICIPIO'] != code:
                    raise ValueError(f'Código de município inesperado em {archive_path.name}.')
                quality = row['NV_GEO_COORD']
                if quality not in {'1', '2', '3', '4'}:
                    continue
                latitude, longitude = float(row['LATITUDE']), float(row['LONGITUDE'])
                if not any(west <= longitude <= east and south <= latitude <= north for west, south, east, north in bounds):
                    continue
                street = named_street(row['NOM_TIPO_SEGLOGR'].strip(), row['NOM_TITULO_SEGLOGR'], row['NOM_SEGLOGR'])
                if not street:
                    continue
                district = title(row['DSC_LOCALIDADE'])
                points_by_street[street, district][quality].add((latitude, longitude))
    return points_by_street


def reference_point(points):
    center_lat = median(latitude for latitude, _ in points)
    center_lon = median(longitude for _, longitude in points)
    latitude, longitude = min(
        points,
        key=lambda point: ((point[0] - center_lat) ** 2 + (point[1] - center_lon) ** 2, point),
    )
    return latitude, longitude


def read_street_faces(archive_path, code, uf, bounds, region):
    base = f'{uf}/{code}_faces_de_logradouros_2022'
    with zipfile.ZipFile(archive_path) as archive:
        if f'{base}.shp' not in archive.namelist():
            raise ValueError(f'Município {code} ausente na base de faces de {uf}.')
        parts = {extension: io.BytesIO(archive.read(f'{base}.{extension}')) for extension in ('shp', 'shx', 'dbf')}
    faces = defaultdict(list)
    fields = ['NM_TIP_LOG', 'NM_TIT_LOG', 'NM_LOG']
    with shapefile.Reader(**parts, encoding='utf-8') as reader:
        for item in reader.iterShapeRecords(fields=fields, bbox=bounds):
            street = named_street(item.record['NM_TIP_LOG'].strip(), item.record['NM_TIT_LOG'], item.record['NM_LOG'])
            if not street:
                continue
            line = shape(item.shape.__geo_interface__).intersection(region)
            if line.length:
                faces[street_key(street)].append((street, line))
    return faces


def merge_streets(streets, faces):
    records = []
    address_keys = set()
    for (street, district), points in sorted(streets.items()):
        key = street_key(street)
        latitude, longitude = reference_point(points[min(points)])
        address_keys.add(key)
        if key in faces:
            point = Point(longitude, latitude)
            line = min((line for _, line in faces[key]), key=point.distance)
            if point.distance(line) <= MAX_STREET_OFFSET:
                snapped = nearest_points(point, line)[1]
                latitude, longitude = snapped.y, snapped.x
        records.append([street, district, latitude, longitude])

    for key, entries in sorted(faces.items()):
        if key in address_keys:
            continue
        street, line = max(entries, key=lambda entry: entry[1].length)
        point = line.interpolate(0.5, normalized=True)
        records.append([street, '', point.y, point.x])
    return records


def map_lines(faces):
    for entries in faces.values():
        for street, geometry in entries:
            parts = geometry.geoms if hasattr(geometry, 'geoms') else [geometry]
            for line in parts:
                if line.geom_type != 'LineString':
                    continue
                points = [
                    [round(lng, 6), round(lat, 6)]
                    for lng, lat in line.simplify(0.000005).coords
                ]
                if len({tuple(point) for point in points}) > 1:
                    yield street, points


def write_gzip(path, data):
    payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.part')
    temporary.write_bytes(gzip.compress(payload, compresslevel=6, mtime=0))
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description='Gera o índice de logradouros do CNEFE dentro da área do SIGOU.')
    parser.add_argument('--cache', type=Path, required=True, help='Diretório para guardar os arquivos públicos baixados.')
    parser.add_argument('--output', type=Path, default=PROJECT / 'src/data/logradouros-cnefe.json.gz')
    parser.add_argument('--map-output', type=Path, default=PROJECT / 'src/data/trechos-ibge.json.gz')
    parser.add_argument('--faces-only', action='store_true', help='Gera apenas os trechos do mapa a partir dos arquivos de faces.')
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    config = subprocess.check_output(['node', '-p', "JSON.stringify(require('./src/utils/serviceArea').SERVICE_AREAS)"], cwd=PROJECT)
    bounds = [(area['minLng'], area['minLat'], area['maxLng'], area['maxLat']) for area in json.loads(config)]
    areas = [box(*rectangle) for rectangle in bounds]
    region = unary_union(areas)
    if args.faces_only:
        with gzip.open(args.output, 'rt', encoding='utf-8') as source:
            municipalities = [entry[:3] for entry in json.load(source)]
    else:
        municipalities = municipalities_in_area(args.cache, areas)
    print(f'{len(municipalities)} municípios na área do mapa.', flush=True)
    if not municipalities:
        parser.error('Nenhum município encontrado na área do mapa.')
    urls = {} if args.faces_only else archive_urls(args.cache, municipalities)
    face_archives = {}
    for uf in sorted({uf for _, _, uf in municipalities}):
        filename = f'{uf}_faces_de_logradouros_2022_shp.zip'
        face_archives[uf] = download(f'{FACES_URL}/{filename}', args.cache / filename)

    def import_municipality(municipality):
        code, name, uf = municipality
        faces = read_street_faces(face_archives[uf], code, uf, region.bounds, region)
        lines = list(map_lines(faces))
        if args.faces_only:
            return None, lines
        archive = download(urls[code], args.cache / f'{code}.zip')
        streets = read_streets(archive, code, bounds)
        records = merge_streets(streets, faces)
        return [code, name, uf, records], lines

    with ThreadPoolExecutor(max_workers=5) as executor:
        catalog = []
        segments = []
        for index, (municipality, lines) in enumerate(executor.map(import_municipality, municipalities), start=1):
            if municipality:
                catalog.append(municipality)
            segments.extend(lines)
            if index % 20 == 0:
                print(f'{index}/{len(municipalities)} municípios importados.', flush=True)

    write_gzip(args.map_output, segments)
    print(f'Trechos com nome no mapa: {len(segments)}', flush=True)
    if args.faces_only:
        return
    write_gzip(args.output, catalog)
    print(f'Municípios com referências: {sum(bool(records) for _, _, _, records in catalog)}')
    print(f'Logradouros por município: {sum(len({record[0] for record in records}) for _, _, _, records in catalog)}')
    print(f'Referências por localidade: {sum(len(records) for _, _, _, records in catalog)}')
    print(f'Municípios sem referência no recorte: {[(name, uf) for _, name, uf, records in catalog if not records]}')


if __name__ == '__main__':
    main()
