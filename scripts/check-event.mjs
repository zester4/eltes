import postgres from "postgres";

async function checkEventProcessing() {
  const client = postgres(process.env.POSTGRES_URL);
  
  const events = await client`SELECT * FROM "Event" ORDER BY "createdAt" DESC LIMIT 1`;
  console.log("Latest Event:", JSON.stringify(events, null, 2));

  if (events.length > 0) {
    const messages = await client`SELECT * FROM "Message_v2" ORDER BY "createdAt" DESC LIMIT 5`;
    console.log("Latest Messages:", JSON.stringify(messages, null, 2));
  }

  await client.end();
}

checkEventProcessing().catch(console.error);
