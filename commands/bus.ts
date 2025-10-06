import { readFileSync } from "node:fs";
import { prettyTime, TimeString } from "../utils";

const calendar = await JSON.parse(readFileSync("./metro/json/calendar.json", "utf8"));
const routes = await JSON.parse(readFileSync("./metro/json/routes.json", "utf8"));
const stops = await JSON.parse(readFileSync("./metro/json/stops.json", "utf8"));
const stopTimes = await JSON.parse(readFileSync("./metro/json/stop_times.json", "utf8"));
const trips = await JSON.parse(readFileSync("./metro/json/trips.json", "utf8"));

export const busStop = (stopId: string) => {
  let reply = "";
  const stop = stops.find((stop: any) => stop.stop_id === stopId);
  if (!stop) {
    return "No stop found with that id.";
  }
  const currentTime = new Date(Date.now()).toLocaleTimeString("en-US", {
    hour12: false,
  }) as TimeString;
  const schedule = stopTimes
    .filter((stopTime: any) => stopTime.stop_id === stop.stop_id)
    .filter((stopTime: any) => stopTime.arrival_time >= currentTime);
  const nextArrivalByRoute: any[] = []; // { key: route_id, route_short_name, arrival_time }
  schedule.forEach((stopTime: any) => {
    const trip = trips.find((trip: any) => trip.trip_id === stopTime.trip_id);
    const route = routes.find((route: any) => route.route_id === trip.route_id);
    if (
      !nextArrivalByRoute[route.route_id] ||
      nextArrivalByRoute[route.route_id].arrival_time > stopTime.arrival_time
    ) {
      nextArrivalByRoute[route.route_id] = {
        route_short_name: route.route_short_name,
        arrival_time: stopTime.arrival_time,
      };
    }
  });

  reply = `${stop.stop_name}`;
  if (nextArrivalByRoute.length) {
    nextArrivalByRoute.forEach(
      (arrival) =>
        (reply += `\n${arrival.route_short_name.replaceAll('"', "")} - ${prettyTime(
          currentTime,
          arrival.arrival_time
        )}`)
    );
  } else {
    reply += "\nNo upcoming trips.";
  }
  return reply;
};

export const busStopAndRoute = (stopId: string, routeId: string) => {
  let reply = "";
  const stop = stops.find((s: any) => s.stop_id === stopId);
  if (!stop) {
    return "No stop found with that id.";
  }
  const route = routes.find((r: any) => r.route_short_name.toLowerCase() === `\"${routeId}\"`);

  if (!route) {
    return "No route found with that id.";
  }
  const currentTime = new Date(Date.now()).toLocaleTimeString("en-US", {
    hour12: false,
  }) as TimeString;
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const currentDay = dayNames[new Date(Date.now()).getDay()];
  const trip = trips
    .filter((t: any) => t.route_id === route.route_id)
    .filter(
      (t: any) => calendar.find((c: any) => c.service_id === t.service_id)[currentDay] === "1"
    );
  const futureStopTimes = stopTimes
    .filter((stopTime: any) => stopTime.stop_id === stop.stop_id)
    .filter((stopTime: any) => stopTime.arrival_time >= currentTime);

  const matchingStops: any[] = [];
  futureStopTimes.forEach((s: any) => {
    trip.forEach((t: any) => {
      if (s.trip_id === t.trip_id) {
        matchingStops.push(s);
      }
    });
  });

  reply = `${stop.stop_name}`;
  if (matchingStops.length) {
    matchingStops
      .sort((a, b) => (a.arrival_time > b.arrival_time ? 1 : -1))
      .slice(0, 5)
      .map((ms) => (reply += `\n${prettyTime(currentTime, ms.arrival_time)} (s)`));
  } else {
    reply += "\nNo upcoming trips.";
  }
  return reply;
};
