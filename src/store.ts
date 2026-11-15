import { configureStore } from "@reduxjs/toolkit";
import { activityReducer } from "./app/activitySlice";
import { preferencesReducer } from "./app/preferencesSlice";
import { environmentReducer } from "./features/environment/environmentSlice";
import { gitReducer } from "./features/git/gitSlice";
import { githubReducer } from "./features/github/githubSlice";
import { island } from "./features/island/islandSlice";
import { projectsReducer } from "./features/projects/projectsSlice";
import { remoteReducer } from "./features/remote/remoteSlice";

export function createAppStore() {
  return configureStore({
    reducer: {
      island: island.reducer, preferences: preferencesReducer, activity: activityReducer,
      projects: projectsReducer, environment: environmentReducer, git: gitReducer, github: githubReducer, remote: remoteReducer,
    },
  });
}

type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore["getState"]>;
