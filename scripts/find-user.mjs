import postgres from "postgres";

async function findUser() {
  const client = postgres(process.env.POSTGRES_URL);
  const users = await client`SELECT id, email FROM "User" LIMIT 5`;
  console.log(JSON.stringify(users, null, 2));
  await client.end();
}

findUser().catch(console.error);
