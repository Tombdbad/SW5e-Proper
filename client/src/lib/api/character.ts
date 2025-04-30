import axios from "axios";

export async function saveCharacterData(characterData: any) {
  return axios.post("/api/character/save", characterData);
}

export async function fetchCharacterData(characterId: string) {
  return axios.get(`/api/character/${characterId}`);
}
