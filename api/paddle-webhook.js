// Paddle (Billing) webhook → issue a licence key and email it to the buyer.
// Env vars (Vercel → Project → Settings → Environment Variables):
//   PADDLE_WEBHOOK_SECRET  endpoint secret from Paddle → Developer tools → Notifications
//   PADDLE_API_KEY         Paddle API key (read customers)
//   PADDLE_ENV             "sandbox" or "live" (default live)
//   PADDLE_PRICE_ID        price id for Mockingbird (only these purchases get a key)
//   LICENSE_PRIVATE_KEY    from secrets/LICENSE_PRIVATE_KEY.txt
//   RESEND_API_KEY         from resend.com (mockingbird.ai domain verified)
//   LICENCE_FROM           optional, default "Mockingbird <licences@mockingbird.ai>"
import { createHmac, timingSafeEqual } from "node:crypto";
import { makeLicence, licenceEmail } from "./_licence.js";

function verifyPaddleSignature(raw, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(";").map((p) => p.split("=")));
  const ts = parts.ts, h1 = parts.h1;
  if (!ts || !h1) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // replay window
  const expected = createHmac("sha256", secret).update(`${ts}:${raw}`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(h1);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function getCustomer(id) {
  const base = process.env.PADDLE_ENV === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  const r = await fetch(`${base}/customers/${id}`, { headers: { Authorization: `Bearer ${process.env.PADDLE_API_KEY}` } });
  if (!r.ok) throw new Error(`Paddle customer lookup failed: ${r.status}`);
  return (await r.json()).data;
}

async function sendEmail(to, subject, { text, html }) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.LICENCE_FROM || "Mockingbird <licences@mockingbird.ai>",
      reply_to: "hello@mockingbird.ai",
      to: [to], subject, text, html,
    }),
  });
  if (!r.ok) throw new Error(`Resend failed: ${r.status} ${await r.text()}`);
}

export async function POST(request) {
  const raw = await request.text();
  if (!verifyPaddleSignature(raw, request.headers.get("paddle-signature"), process.env.PADDLE_WEBHOOK_SECRET)) {
    return new Response("invalid signature", { status: 401 });
  }
  const event = JSON.parse(raw);
  if (event.event_type !== "transaction.completed") return new Response("ignored", { status: 200 });

  const txn = event.data;
  const wanted = process.env.PADDLE_PRICE_ID;
  const items = txn.items || [];
  if (wanted && !items.some((i) => (i.price && i.price.id) === wanted || i.price_id === wanted)) {
    return new Response("not a Mockingbird purchase", { status: 200 });
  }

  try {
    const customer = await getCustomer(txn.customer_id);
    // Deterministic per transaction, so a Paddle retry re-sends the same key.
    const key = makeLicence({ email: customer.email, name: customer.name, order: txn.id, issuedAt: txn.billed_at || txn.created_at });
    await sendEmail(customer.email, "Your Mockingbird licence key", licenceEmail({ name: customer.name, key }));
    console.log(`licence sent for ${txn.id}`);
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 }); // Paddle will retry
  }
}

export function GET() {
  return new Response("Mockingbird licence webhook is up.", { status: 200 });
}
