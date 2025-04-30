import axios from "axios";

export async function saveCampaignState(campaignId: string, data: any) {
  return axios.post(`/api/campaign/${campaignId}/save`, data);
}

export async function fetchCampaignData(campaignId: string) {
  return axios.get(`/api/campaign/${campaignId}`);
}
