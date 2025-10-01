import { NodeJSSerialConnection, Constants } from "@liamcottle/meshcore.js";

// Create connection to companion radio
const connection = new NodeJSSerialConnection(process.env.SERIAL_PORT);

connection.on("connected", async () => {
  console.log("[Connected]");

  // Sync Time
  console.log("Syncing Time...");
  await connection.syncDeviceTime();

  // Set Name
  await connection.setAdvertName("KCM BusBot 🚎");

  // Get bot channel
  const botChannel = await connection.findChannelByName("#bot");

  // Close Connection
  await connection.close();
});

// Connect to companion
await connection.connect();