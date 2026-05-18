/** Thin HTTP wrapper around Bumblebee API. */
import axios, { type AxiosInstance } from "axios";

const BASE_URL = process.env.BUMBLEBEE_API_URL ?? "http://localhost:8000";
const PROJECT_SLUG = process.env.BUMBLEBEE_PROJECT ?? "bb";

let _client: AxiosInstance | null = null;

export function api(): AxiosInstance {
  if (_client) return _client;
  _client = axios.create({
    baseURL: BASE_URL,
    timeout: 30_000,
    headers: { "Content-Type": "application/json" },
  });
  return _client;
}

export function projectSlug(): string {
  return PROJECT_SLUG;
}
