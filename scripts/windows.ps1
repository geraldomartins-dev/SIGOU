param([ValidateSet('Install', 'Start')][string]$Mode = 'Start', [switch]$ForceDownload)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$env:NODE_NO_WARNINGS = '1'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

function Find-Node {
    $candidates = @((Join-Path $root 'runtime\node\node.exe'))
    $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($systemNode) { $candidates += $systemNode.Source }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            & $candidate -e "const [a,b]=process.versions.node.split('.').map(Number);require('node:sqlite');process.exit(a>22||(a===22&&b>=5)?0:1)" 2>$null
            if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath (Join-Path (Split-Path $candidate) 'npm.cmd'))) { return $candidate }
        }
    }
    return $null
}

function Install-Node {
    Write-Host 'Baixando o Node.js do site oficial. Nao precisa instalar nada manualmente...'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Este pacote precisa de Windows de 64 bits.' }
    $releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 60
    # Mantem a familia 24 LTS para compatibilidade com este projeto.
    $release = $releases | Where-Object { $_.version -match '^v24\.' -and $_.lts -and $_.files -contains "win-$arch-zip" } | Select-Object -First 1
    if (-not $release) { throw 'Nao foi possivel localizar o Node.js compativel no site oficial. Tente novamente com internet.' }
    $version = $release.version
    if ($version -notmatch '^v24\.\d+\.\d+$') { throw 'Resposta inesperada do site de download.' }
    $name = "node-$version-win-$arch"
    $runtime = Join-Path $root 'runtime'
    New-Item -ItemType Directory -Force -Path $runtime | Out-Null
    $stage = Join-Path $runtime ([Guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $stage | Out-Null
    $zip = Join-Path $stage "$name.zip"
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$version/$name.zip" -OutFile $zip -TimeoutSec 600
    $sums = (Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$version/SHASUMS256.txt" -TimeoutSec 60).Content
    $line = $sums -split "`n" | Where-Object { $_.Trim().EndsWith("  $name.zip") } | Select-Object -First 1
    if (-not $line) { throw 'O site nao informou a verificacao do download. Instalacao interrompida.' }
    $expected = ($line.Trim() -split '\s+')[0]
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($zip)
    try { $actual = [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '') }
    finally { $stream.Dispose(); $algorithm.Dispose() }
    if ($actual -ne $expected) { throw 'O download veio incompleto ou alterado. Execute o instalador novamente.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $stage)
    $target = Join-Path $runtime 'node'
    if (Test-Path -LiteralPath $target) {
        Rename-Item -LiteralPath $target -NewName ('node-anterior-' + [Guid]::NewGuid().ToString())
    }
    $unpacked = (Resolve-Path -LiteralPath (Join-Path $stage $name)).Path
    $runtimePath = (Resolve-Path -LiteralPath $runtime).Path + [System.IO.Path]::DirectorySeparatorChar
    if (-not $unpacked.StartsWith($runtimePath, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'A pasta do Node.js extraido esta fora do local esperado.'
    }
    Move-Item -LiteralPath $unpacked -Destination $target
    Remove-Item -LiteralPath $zip
    Remove-Item -LiteralPath $stage
    return (Join-Path $target 'node.exe')
}

try {
    if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json')) -or -not (Test-Path -LiteralPath (Join-Path $root 'src\server.js'))) {
        throw 'Faltam arquivos do ResolveJa. Clique com o botao direito no ZIP, escolha Extrair tudo e abra a pasta extraida.'
    }
    $node = Find-Node
    if ($Mode -eq 'Install') {
        if (-not $node -or $ForceDownload) { $node = Install-Node }
        $env:PATH = (Split-Path $node) + ';' + $env:PATH
        Write-Host 'Instalando e conferindo os componentes do ResolveJa. Aguarde...'
        $npm = Join-Path (Split-Path $node) 'npm.cmd'
        # install repara componentes ausentes sem apagar uma instalacao em uso.
        & $npm install --omit=dev --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel baixar os componentes. Confira a internet e execute 1_INSTALAR_SIGOU novamente.' }
        & $node (Join-Path $PSScriptRoot 'controle.cjs') prepare
        if ($LASTEXITCODE -ne 0) { throw 'A preparacao do banco falhou. Veja a explicacao acima. A instalacao NAO foi concluida.' }
        Write-Host 'INSTALACAO CONCLUIDA E CONFERIDA. Agora abra 2_INICIAR_SIGOU.bat.' -ForegroundColor Green
    } else {
        if (-not $node) { throw 'O Node.js esta ausente ou incompleto. Abra 1_INSTALAR_SIGOU.bat; ele instala automaticamente.' }
        $env:PATH = (Split-Path $node) + ';' + $env:PATH
        & $node (Join-Path $PSScriptRoot 'controle.cjs') start
        if ($LASTEXITCODE -ne 0) { exit 1 }
    }
    exit 0
} catch {
    Write-Host ('NAO FOI POSSIVEL CONTINUAR: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
