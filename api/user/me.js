export default function handler(req, res) {
  return res.status(200).json({
    user_id: "demo",
    plan: "free",
    limits: { monthly_saves: 10, retention_days: 30 },
    usage: { period: "2025-12", saves_used: 0 }
  });
}
