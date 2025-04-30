import axios from "axios";

export async function saveCharacterData(characterData: any) {
  return axios.post("/api/character/save", characterData);
}

export async function fetchCharacterData(characterId: string) {
  return axios.get(`/api/character/${characterId}`);
}

export async function fetchSW5ESpecies() {
  return axios.get('/api/sw5e/species');
}

export async function fetchSW5EClasses() {
  return axios.get('/api/sw5e/classes');
}

export async function fetchSW5EBackgrounds() {
  return axios.get('/api/sw5e/backgrounds');
}

export async function fetchSW5EForcePowers() {
  return axios.get(`/api/sw5e/ForcePowers`);
}

export async function fetchSW5ETechPowers() {
  return axios.get(`/api/sw5e/TechPowers`);
}

export async function fetchSW5EEquipment() {
  return axios.get('/api/sw5e/equipment');
}
