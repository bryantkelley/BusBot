import { readFileSync } from "node:fs";

const routes = await JSON.parse(readFileSync("./metro/json/routes.json", "utf8"));
const stops = await JSON.parse(readFileSync("./metro/json/stops.json", "utf8"));

type Translation = {
	text: string;
	language: string;
};

type Alert = {
	id: string;
	alert: {
		effect: string;
		effect_detail: string;
		cause: string;
		cause_detail: string;
		header_text: {
			translation: Translation[];
		};
		description_text: {
			translation: Translation[];
		};
		severity_level: string;
		url: {
			translation: Translation[];
		};
		service_effect_text: {
			translation: Translation[];
		};
		short_header_text: {
			translation: Translation[];
		};
		severity: number;
		created_timestamp: number;
		last_modified_timestamp: number;
		last_push_notification_timestamp: number;
		timeframe_text: {
			translation: Translation[];
		};
		alert_lifecycle: string;
		duration_certainty: string;
		reminder_times: number[];
		active_period: {
			start: number;
			end: number;
		}[];
		informed_entity: {
			agency_id: string;
			route_type: number;
			route_id: string;
			stop_id: string;
			activities: string[];
		}[];
	};
};

const getAlerts = async () => {
	let alerts: Alert[] = [];
	try {
		const alertsUrl = process.env.METRO_GTFS_RT_SERVICE_ALERTS_FEED;
		if (alertsUrl) {
			const response = await fetch(alertsUrl);
			const data = await response.json();
			const { entity } = data;
			if (entity.length) {
				alerts = entity;
			}
		}
	} catch (e) {
		console.log("Error getting alerts:", e);
	}
	return alerts;
};

export const alertsStop = async (stopId: string) => {
	let reply = "";
	const stop = stops.find((stop: any) => stop.stop_id === stopId);
	if (!stop) {
		return "No stop found with that id.";
	}
	reply = `${stop.stop_name}`;

	const alerts = await getAlerts();
	const matchingAlerts = alerts.filter((alert) =>
		alert.alert.informed_entity.some((entity) => entity.stop_id === stop.stop_id)
	);

	if (matchingAlerts.length) {
		matchingAlerts.forEach(({ alert }) => {
			const matchingTranslationLanguageIndex = alert.short_header_text.translation.findIndex(
				(translation) => translation.language === process.env.LANGUAGE_CODE
			);
			reply += `\n${
				alert.short_header_text.translation[
					matchingTranslationLanguageIndex ? matchingTranslationLanguageIndex : 0
				].text
			}`;
		});
	} else {
		reply += "\nNo alerts.";
	}

	return reply;
};

export const alertsStopAndRoute = async (stopId: string, routeId: string) => {
	let reply = "";
	const stop = stops.find((s: any) => s.stop_id === stopId);
	if (!stop) {
		return "No stop found with that id.";
	}
	const route = routes.find((r: any) => r.route_short_name.toLowerCase() === `\"${routeId}\"`);

	if (!route) {
		return "No route found with that id.";
	}

	const alerts = await getAlerts();
	const matchingAlerts = alerts.filter((alert) =>
		alert.alert.informed_entity.some(
			(entity) => entity.stop_id === stop.stop_id && entity.route_id === route.route_id
		)
	);

	if (matchingAlerts.length) {
		matchingAlerts.forEach(({ alert }) => {
			const matchingTranslationLanguageIndex = alert.short_header_text.translation.findIndex(
				(translation) => translation.language === process.env.LANGUAGE_CODE
			);
			reply += `\n${
				alert.short_header_text.translation[
					matchingTranslationLanguageIndex ? matchingTranslationLanguageIndex : 0
				].text
			}`;
		});
	} else {
		reply += "\nNo alerts.";
	}

	return reply;
};
