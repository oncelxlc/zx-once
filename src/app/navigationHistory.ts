import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { NavigationType } from "react-router";

interface Stop {
  key: string;
  position: number | null;
}

interface Visit {
  page: string;
  to: string;
  stops: Stop[];
}

interface History {
  visits: Visit[];
  cursor: number;
  position: number | null;
  pending: number | null;
}

interface Arrival extends Stop {
  page: string;
  to: string;
  action: NavigationType;
}

const initialState: History = { visits: [], cursor: -1, position: null, pending: null };

export const navigationHistory = createSlice({
  name: "navigationHistory",
  initialState,
  reducers: {
    requested(state, { payload }: PayloadAction<number | null>) {
      state.pending = payload;
    },
    arrived(state, { payload }: PayloadAction<Arrival>) {
      const { page, to, key, position, action } = payload;
      const previousPosition = state.position;
      const requested = state.pending;
      state.pending = null;
      state.position = position;

      // A single page can own several browser stops, e.g. a project list and its open drawer.
      const known = state.visits.findIndex((visit, index) => visit.page === page &&
        (key !== "default" || position !== null || index === state.cursor) &&
        visit.stops.some(stop => stop.key === key && (key !== "default" || stop.position === position)));
      const knownStop = state.visits[known]?.stops.find(stop => stop.key === key);
      if (action === "POP" && (position === null || knownStop?.position !== position)) {
        // A hand-edited hash can restart the router's index. Keys still identify pages across that gap.
        for (const visit of state.visits) {
          for (const stop of visit.stops) stop.position = null;
        }
      }
      if (knownStop) {
        state.cursor = known;
        knownStop.position = position;
        return;
      }
      if (position !== null && action !== "POP") {
        const pushed = action === "PUSH" || (requested === null && position !== previousPosition);
        for (const visit of state.visits) {
          visit.stops = visit.stops.filter(stop => stop.position === null ||
            (pushed ? stop.position < position : stop.position !== position));
        }
      }
      const visit: Visit = { page, to, stops: [] };
      if (requested !== null && state.visits[requested]?.page === page) {
        state.cursor = requested;
      } else if (state.visits[state.cursor]?.page !== page) {
        if (action === "REPLACE" && state.cursor >= 0 && position === previousPosition) {
          state.visits[state.cursor] = visit;
          if (state.visits[state.cursor - 1]?.page === page) {
            state.visits.splice(state.cursor, 1);
            state.cursor--;
          }
          if (state.visits[state.cursor + 1]?.page === page) {
            const [next] = state.visits.splice(state.cursor + 1, 1);
            state.visits[state.cursor].stops.push(...next.stops);
          }
        } else if (action === "POP" && previousPosition !== null && position !== null && position < previousPosition) {
          // The browser can go back to a route from before this store was created on reload.
          state.visits.splice(state.cursor, 0, visit);
        } else {
          state.cursor++;
          state.visits.splice(state.cursor, state.visits.length, visit);
        }
      }
      const current = state.visits[state.cursor];
      if (position === null && action === "REPLACE") current.stops = current.stops.filter(stop => stop.position !== null);
      current.stops.push({ key, position });
    },
  },
});
