import { env } from "cloudflare:workers";
import { googleMapsRendererConfigured, publicMapLaunchEnabled } from "@/config/runtime-env";

type PublicMapRuntimeBindings = {
  PUBLIC_MAP_ENABLED?: string;
  GOOGLE_MAPS_BROWSER_API_KEY?: string;
  GOOGLE_MAPS_MAP_ID?: string;
  MAP_UI_TEST_RENDERER?: string;
};

export type PublicMapRuntime = {
  rendererEnabled: boolean;
  googleApiKey: string;
  googleMapId: string;
  testRendererEnvironment: boolean;
};

export function getPublicMapRuntime(): PublicMapRuntime {
  const bindings = env as unknown as PublicMapRuntimeBindings;
  const launchEnv = {
    PUBLIC_MAP_ENABLED: bindings.PUBLIC_MAP_ENABLED ?? process.env.PUBLIC_MAP_ENABLED,
    GOOGLE_MAPS_BROWSER_API_KEY: bindings.GOOGLE_MAPS_BROWSER_API_KEY ?? process.env.GOOGLE_MAPS_BROWSER_API_KEY,
    GOOGLE_MAPS_MAP_ID: bindings.GOOGLE_MAPS_MAP_ID ?? process.env.GOOGLE_MAPS_MAP_ID,
  };
  const rendererEnabled = publicMapLaunchEnabled(launchEnv) && googleMapsRendererConfigured(launchEnv);
  return {
    rendererEnabled,
    googleApiKey: rendererEnabled ? launchEnv.GOOGLE_MAPS_BROWSER_API_KEY ?? "" : "",
    googleMapId: rendererEnabled ? launchEnv.GOOGLE_MAPS_MAP_ID ?? "" : "",
    testRendererEnvironment: (bindings.MAP_UI_TEST_RENDERER ?? process.env.MAP_UI_TEST_RENDERER) === "1",
  };
}
