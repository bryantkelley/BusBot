import { NodeJSSerialConnection, Constants } from "@liamcottle/meshcore.js";

// Create connection to companion radio
const connection = new NodeJSSerialConnection(process.env.SERIAL_PORT);

// Initial Setup
connection.on("connected", async () => {
  console.log("Connected");

  // Sync Time
  console.log("Syncing Time...");
  await connection.syncDeviceTime();
  console.log("Time Synced");

  // Set Name
  await connection.setAdvertName("KCM BusBot 🚎");

  await connection.setAutoAddContacts(true);
});

connection.on(Constants.PushCodes.MsgWaiting, async () => {
  try {
    const waitingMessages = await connection.getWaitingMessages();

    waitingMessages.forEach((message) => {
      if (message.contactMessage) {
        handleContactMessage(message.contactMessage);
      } else if (message.channelMessage) {
        handleChannelMessage(message.channelMessage);
      }
    });

  } catch (error) {
    console.log(error);
  }
});

const handleContactMessage = async (message) => {
  console.log("Contact Message Received");

  const contact = await connection.findContactByPublicKeyPrefix(message.pubKeyPrefix);
  if (!contact) {
    console.log("No contact found for message");
    return;
  }

  if (message.text.toLowerCase().startsWith("bus")) {
    await connection.sendTextMessage(contact.publicKey, "Transit scheduling, geographic, and real-time data provided by permission of King County.", Constants.TxtTypes.Plain);
    return;
  }
  return;
};

const handleChannelMessage = async (message) => {
  console.log("Channel Message Received");
  const commandChannel = await connection.findChannelByName(process.env.BOT_CHANNEL);

  if (message.channelIdx !== commandChannel.channelIdx) {
    console.log("Message not in command channel");
    return;
  }

  if (message.text.toLowerCase().includes("bus")) {
    await connection.sendChannelTextMessage(commandChannel.channelIdx, `King County Metro bus and route info available via DM.`);
    return;
  }
  return;
}

// Clean up contacts with auto-add contacts on
connection.on(Constants.PushCodes.Advert, async () => {
  const contacts = await connection.getContacts();
  // Filter out users and remove any room servers and repeaters
  await contacts.filter(({ type }) => type !== 1).map(({ publicKey, advName }) => {
    console.log("Removing Contact:", advName);
    connection.removeContact(publicKey);
  });
});

connection.on("disconnected", () => {
  console.log("Disconnected");
});

// Connect to companion
await connection.connect();
