const { haversineDistance } = require('../utils/haversine');

function calculateWaitingHours(createdAt, now = new Date()) {
  return Math.max(0, (now.getTime() - new Date(createdAt).getTime()) / 3_600_000);
}

/** Score = urgência*10 - distância*2 + espera*0,5. */
function prioritizeReports(reports, attendantPosition, now = new Date()) {
  return reports
    .map((report) => {
      const distanceKm = haversineDistance(
        attendantPosition.latitude,
        attendantPosition.longitude,
        report.latitude,
        report.longitude
      );
      const waitingHours = calculateWaitingHours(report.criado_em, now);
      const score = (report.grau_urgencia * 10) - (distanceKm * 2) + (waitingHours * 0.5);

      return {
        ...report,
        distancia_km: Number(distanceKm.toFixed(3)),
        horas_espera: Number(waitingHours.toFixed(2)),
        score: Number(score.toFixed(3))
      };
    })
    .sort((a, b) => b.score - a.score || b.grau_urgencia - a.grau_urgencia || a.id - b.id)
    .map((report, index) => ({ ...report, recomendada: index === 0 }));
}

function prioritizeWithTravel(reports, attendantPosition, travelMetrics, now = new Date()) {
  const haversineRanking = prioritizeReports(reports, attendantPosition, now);
  const metricsById = new Map(reports.map((report, index) => [report.id, travelMetrics?.[index]]));
  return haversineRanking.map((report) => {
    const metric = metricsById.get(report.id);
    if (!Number.isFinite(metric?.tempo_viagem_min) || metric.tempo_viagem_min < 0
      || !Number.isFinite(metric?.distancia_rota_km) || metric.distancia_rota_km < 0) return { ...report, rota_real: false };
    const score = (report.grau_urgencia * 10) - (metric.tempo_viagem_min * 0.15) + (report.horas_espera * 0.5);
    return { ...report, ...metric, distancia_km: Number(metric.distancia_rota_km.toFixed(3)), score: Number(score.toFixed(3)), rota_real: true };
  }).sort((a, b) => b.score - a.score || b.grau_urgencia - a.grau_urgencia || a.id - b.id)
    .map((report, index) => ({ ...report, recomendada: index === 0 }));
}

module.exports = { calculateWaitingHours, prioritizeReports, prioritizeWithTravel };
