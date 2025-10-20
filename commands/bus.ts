import { readFileSync } from "node:fs";
import { prettyTime, TimeString } from "../utils";

const calendar = await JSON.parse(readFileSync("./metro/json/calendar.json", "utf8"));
const routes = await JSON.parse(readFileSync("./metro/json/routes.json", "utf8"));
const stops = await JSON.parse(readFileSync("./metro/json/stops.json", "utf8"));
const stopTimes = await JSON.parse(readFileSync("./metro/json/stop_times.json", "utf8"));
const trips = await JSON.parse(readFileSync("./metro/json/trips.json", "utf8"));

type TripUpdate = {
  id: string;
  trip_update: {
    trip: {
      trip_id: string;
      direction_id: number;
      route_id: string;
      start_date: string;
      schedule_relationship: string;
    };
    stop_time_update: {
      stop_sequence: number;
      stop_id: string;
      arrival: {
        delay: number;
        time: number;
      };
      departure: {
        delay: number;
        time: number;
      };
      schedule_relationship: string;
    }[];
  };
};

const getTripUpdates = async () => {
  let tripUpdates: TripUpdate[] = [];
  try {
    const tripUpdatesUrl = process.env.METRO_GTFS_RT_TRIP_UPDATES_FEED;
    if (tripUpdatesUrl) {
      const response = await fetch(tripUpdatesUrl);
      const data = await response.json();
      const { entity } = data;
      if (entity.length) {
        tripUpdates = entity;
      }
    }
  } catch (e) {
    console.log("Error getting realtime data:", e);
  }
  return tripUpdates;
};
export const busStop = async (stopId: string) => {
  let reply = "";
  const stop = stops.find((stop: any) => stop.stop_id === stopId);
  if (!stop) {
    return "No stop found with that id.";
  }

  const tripUpdates = await getTripUpdates();

  const currentTime = new Date(Date.now()).toLocaleTimeString("en-US", {
    hour12: false,
  }) as TimeString;
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const currentDay = dayNames[new Date(Date.now()).getDay()];

  const fitleredTrips = trips.filter(
    (t: any) => calendar.find((c: any) => c.service_id === t.service_id)[currentDay] === "1"
  );

  const schedule = stopTimes
    .filter((stopTime: any) => stopTime.stop_id === stop.stop_id)
    .filter((stopTime: any) => stopTime.arrival_time >= currentTime);
  const nextArrivalByRoute: any[] = []; // { key: route_id, route_short_name, arrival_time }
  schedule.forEach((stopTime: any) => {
    const tripUpdate = tripUpdates.find(
      (ut: any) => ut.trip_update.trip.trip_id === stopTime.trip_id
    );
    const stopUpdate = tripUpdate?.trip_update.stop_time_update.find(
      (stu: any) => stu.stop_id === stopId
    );

    if (stopUpdate) {
      const route = routes.find(
        (route: any) => route.route_id === tripUpdate?.trip_update.trip.route_id
      );
      nextArrivalByRoute[route.route_id] = {
        route_short_name: route.route_short_name,
        arrival_time: new Date(stopUpdate.arrival?.time * 1000).toLocaleTimeString("en-US", {
          hour12: false,
        }) as TimeString,
        scheduled: false,
      };
    } else {
      const scheduledTrip = fitleredTrips.find((trip: any) => trip.trip_id === stopTime.trip_id);
      const route = routes.find((route: any) => route.route_id === scheduledTrip?.route_id);
      if (
        route &&
        (!nextArrivalByRoute[route.route_id] ||
          nextArrivalByRoute[route.route_id].arrival_time > stopTime.arrival_time)
      ) {
        nextArrivalByRoute[route.route_id] = {
          route_short_name: route.route_short_name,
          arrival_time: stopTime.arrival_time,
          scheduled: true,
        };
      }
    }
  });

  reply = `${stop.stop_name}`;
  if (nextArrivalByRoute.length) {
    nextArrivalByRoute.forEach(
      (arrival) =>
        (reply += `\n${arrival.route_short_name.replaceAll('"', "")} - ${prettyTime(
          currentTime,
          arrival.arrival_time
        )}${arrival.scheduled ? " (s)" : ""}`)
    );
  } else {
    reply += "\nNo upcoming trips.";
  }
  return reply;
};

export const busStopAndRoute = async (stopId: string, routeId: string) => {
  let reply = "";
  const stop = stops.find((s: any) => s.stop_id === stopId);
  if (!stop) {
    return "No stop found with that id.";
  }
  const route = routes.find((r: any) => r.route_short_name.toLowerCase() === `\"${routeId}\"`);

  if (!route) {
    return "No route found with that id.";
  }

  const tripUpdates = await getTripUpdates();

  const currentTime = new Date(Date.now()).toLocaleTimeString("en-US", {
    hour12: false,
  }) as TimeString;
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const currentDay = dayNames[new Date(Date.now()).getDay()];

  const filteredTrips = trips
    .filter((t: any) => t.route_id === route.route_id)
    .filter(
      (t: any) => calendar.find((c: any) => c.service_id === t.service_id)[currentDay] === "1"
    );
  const futureStopTimes = stopTimes
    .filter((stopTime: any) => stopTime.stop_id === stop.stop_id)
    .filter((stopTime: any) => stopTime.arrival_time >= currentTime);

  const matchingStops: any[] = [];
  futureStopTimes.forEach((s: any) => {
    filteredTrips.forEach((t: any) => {
      if (s.trip_id === t.trip_id) {
        matchingStops.push({ ...s, scheduled: true });
      }
    });
  });

  reply = `${stop.stop_name} - ${route.route_short_name}`;
  if (matchingStops.length) {
    const filteredMatches = matchingStops.map((ms) => {
      const tripUpdate = tripUpdates.find((ut: any) => ut.trip_update.trip.trip_id === ms.trip_id);
      const stopUpdate = tripUpdate?.trip_update.stop_time_update.find(
        (stu: any) => stu.stop_id === stopId
      );
      if (stopUpdate) {
        return {
          arrival_time: new Date(stopUpdate.arrival.time * 1000).toLocaleTimeString("en-US", {
            hour12: false,
          }) as TimeString,
          scheduled: false,
        };
      }
      return ms;
    });
    filteredMatches
      .sort((a, b) => (a.arrival_time > b.arrival_time ? 1 : -1))
      .slice(0, 5)
      .map(
        (ms) =>
          (reply += `\n${prettyTime(currentTime, ms.arrival_time)}${ms.scheduled ? " (s)" : ""}`)
      );
  } else {
    reply += "\nNo upcoming trips.";
  }
  return reply;
};
