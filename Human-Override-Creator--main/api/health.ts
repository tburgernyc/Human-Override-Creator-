export default function handler(req: any, res: any) {
  res.json({ status: 'ok', hasKey: !!process.env.GEMINI_API_KEY });
}
