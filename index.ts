import { NodeJSSerialConnection, Constants } from "@liamcottle/meshcore.js";
import {
	alertsStop,
	alertsStopAndRoute,
	beats,
	busStop,
	busStopAndRoute,
	help,
	helpAlerts,
	helpBeats,
	helpBus,
	helpInfo,
	info,
	stats,
} from "./commands";

// Check for environment variables
if (!process.env.SERIAL_PORT) {
	throw new Error("Missing SERIAL_PORT");
}

let lastBotAdvert: number; // Date.now()
let validQueryCount = 0;

// Create connection to companion radio
const connection = new NodeJSSerialConnection(process.env.SERIAL_PORT);

// Auto Advert and Info
const checkToAdvertAndInfo = async () => {
	// wait at least 7 days for next advert and info command
	const currentTime = Date.now();
	if (!lastBotAdvert || currentTime - lastBotAdvert > 7 * 24 * 60 * 60 * 1000) {
		console.log("Sending Advert");
		await connection.sendFloodAdvert();
		lastBotAdvert = currentTime;

		if (!process.env.BOT_CHANNEL) {
			throw new Error("Missing BOT_CHANNEL");
		}
		const commandChannel = await connection.findChannelByName(process.env.BOT_CHANNEL);
		setTimeout(async () => {
			await connection.sendChannelTextMessage(commandChannel.channelIdx, info());
		}, 5000);
	}
};

// Initial Setup
connection.on("connected", async () => {
	console.log("Connected");

	// Sync Time
	console.log("Syncing Time...");
	await connection.syncDeviceTime();
	console.log("Time Synced");

	if (!process.env.NODE_NAME) {
		throw new Error("Missing NODE_NAME");
	}
	// Set Name
	await connection.setAdvertName(process.env.NODE_NAME);

	await connection.setManualAddContacts();

	checkToAdvertAndInfo();
});

connection.on(Constants.PushCodes.MsgWaiting, async () => {
	try {
		const waitingMessages = await connection.getWaitingMessages();

		waitingMessages.forEach((message: any) => {
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

const handleCommand = async (cleanedMessage: string): Promise<string | undefined> => {
	let reply = "";
	if (cleanedMessage.startsWith("help")) {
		if (cleanedMessage === "help alerts") {
			reply = helpAlerts();
		} else if (cleanedMessage === "help beats") {
			reply = helpBeats();
		} else if (cleanedMessage === "help bus") {
			reply = helpBus();
		} else if (cleanedMessage === "help info") {
			reply = helpInfo();
		} else {
			reply = help();
		}
	} else if (cleanedMessage.startsWith("info")) {
		reply = info();
	} else if (cleanedMessage.startsWith("alerts")) {
		const firstSpaceIndex = cleanedMessage.indexOf(" "); // Space after the word alerts
		if (firstSpaceIndex === -1) {
			// If no space found, return help
			reply = helpAlerts();
		} else if (firstSpaceIndex !== 6) {
			// If the first space isn't the seventh character, then this isn't a command to answer
			return;
		} else {
			const secondSpaceIndex = cleanedMessage.indexOf(" ", firstSpaceIndex + 1);
			if (secondSpaceIndex === -1) {
				// If there's no second space found, then this is a stopId only
				const stopId = cleanedMessage.slice(firstSpaceIndex + 1);
				reply = await alertsStop(stopId);
			} else {
				const stopId = cleanedMessage.slice(firstSpaceIndex + 1, secondSpaceIndex);
				const routeId = cleanedMessage.slice(secondSpaceIndex + 1);
				reply = await alertsStopAndRoute(stopId, routeId);
			}
		}
	} else if (cleanedMessage.startsWith("bus")) {
		const firstSpaceIndex = cleanedMessage.indexOf(" "); // Space after the word bus
		if (firstSpaceIndex === -1) {
			// If no space found, return help
			reply = helpBus();
		} else if (firstSpaceIndex !== 3) {
			// If the first space isn't the fourth character, then this isn't a command to answer
			return;
		} else {
			const secondSpaceIndex = cleanedMessage.indexOf(" ", firstSpaceIndex + 1);
			if (secondSpaceIndex === -1) {
				// If there's no second space found, then this is a stopId only
				const stopId = cleanedMessage.slice(firstSpaceIndex + 1);
				reply = await busStop(stopId);
			} else {
				const stopId = cleanedMessage.slice(firstSpaceIndex + 1, secondSpaceIndex);
				const routeId = cleanedMessage.slice(secondSpaceIndex + 1);
				reply = await busStopAndRoute(stopId, routeId);
			}
		}
	} else if (cleanedMessage.startsWith("beats")) {
		reply = beats();
	} else if (cleanedMessage.startsWith("stats")) {
		reply = stats(validQueryCount);
	} else {
		// no command found, ignore this message
		return;
	}
	return reply;
};

const divideReply = (message: string) => {
	// 150 (max channel message size) - 32 (max name size) - 3 (mandatory channel message characters)
	const MAX_LENGTH = 115;
	let messageLength = message.length;
	let messageCount = 1;

	while (messageLength > MAX_LENGTH) {
		messageCount = messageCount + 1;
		messageLength = Math.ceil(messageLength / messageCount);
	}

	// return early if no split needed
	if (messageCount === 1) {
		return [message];
	}

	const segmenter = new Intl.Segmenter(process.env.LANGUAGE_CODE ?? "en", { granularity: "word" });
	const words = Array.from(segmenter.segment(message));

	const replies: string[] = [];
	let currentReplyIndex = 0;

	words.forEach(({ segment }) => {
		if (
			replies[currentReplyIndex]?.length &&
			replies[currentReplyIndex].length + segment.length > messageLength
		) {
			currentReplyIndex = currentReplyIndex + 1;
		}
		replies[currentReplyIndex] = (replies[currentReplyIndex] ?? "") + segment;
	});

	return replies;
};

const handleContactMessage = async (message: any) => {
	console.log("Contact Message Received");

	const contact = await connection.findContactByPublicKeyPrefix(message.pubKeyPrefix);
	if (!contact) {
		console.log("No contact found for message");
		return;
	}
	const cleanedMessage = message.text.trim().toLowerCase();

	const reply = await handleCommand(cleanedMessage);

	if (reply) {
		const replies = divideReply(reply);
		await Promise.all(
			replies.map((replyPart, index) => {
				setTimeout(async () => {
					await connection.sendTextMessage(contact.publicKey, replyPart, Constants.TxtTypes.Plain);
				}, (index + 1) * 2000);
			})
		);
		validQueryCount = validQueryCount + 1;
	}
};

const handleChannelMessage = async (message: any) => {
	console.log("Channel Message Received");
	if (!process.env.BOT_CHANNEL) {
		throw new Error("Missing BOT_CHANNEL");
	}
	const commandChannel = await connection.findChannelByName(process.env.BOT_CHANNEL);

	if (message.channelIdx === commandChannel.channelIdx) {
		// remove the colon and the following space
		const separatorIndex = message.text.trim().indexOf(":");
		const cleanedMessage: string = message.text.slice(separatorIndex + 2).toLowerCase();

		const reply = await handleCommand(cleanedMessage);

		if (reply) {
			const replies = divideReply(reply);
			await Promise.all(
				replies.map((replyPart, index) => {
					setTimeout(async () => {
						await connection.sendChannelTextMessage(commandChannel.channelIdx, replyPart);
					}, (index + 1) * 2000);
				})
			);
			validQueryCount = validQueryCount + 1;
		}
	}
};

// Clean up contacts with auto-add contacts on
connection.on(Constants.PushCodes.Advert, async () => {
	const contacts = await connection.getContacts();
	// Filter out users and remove any room servers and repeaters
	contacts
		.filter(({ type }: { type: number }) => type !== 1)
		.map(({ publicKey, advName }: { publicKey: any; advName: string }) => {
			console.log("Removing Contact:", advName);
			connection.removeContact(publicKey);
		});

	checkToAdvertAndInfo();
});

// publicKey: bufferReader.readBytes(32),
// type: bufferReader.readByte(),
// flags: bufferReader.readByte(),
// outPathLen: bufferReader.readInt8(),
// outPath: bufferReader.readBytes(64),
// advName: bufferReader.readCString(32),
// lastAdvert: bufferReader.readUInt32LE(),
// advLat: bufferReader.readUInt32LE(),
// advLon: bufferReader.readUInt32LE(),
// lastMod: bufferReader.readUInt32LE(),
connection.on(Constants.PushCodes.NewAdvert, async (advert: any) => {
	if (advert.type === 1) {
		const { publicKey, type, flags, outPathLen, outPath, advName, lastAdvert, advLat, advLon } =
			advert;
		connection.addOrUpdateContact(
			publicKey,
			type,
			flags,
			outPathLen,
			outPath,
			advName,
			lastAdvert,
			advLat,
			advLon
		);

		checkToAdvertAndInfo();
	}
});

connection.on("disconnected", async () => {
	console.log("Disconnected");
	await connection.connect();
});

// Connect to companion
await connection.connect();
