import axios from "axios";

const SMARTBOX_GENERIC_BASIC_AUTH =
  "NTRiY2NiZmI0MWE5YTUxMTNmMDQ4OGQwOnZkaXZkaQ==";

const RESELLERS = {
  api: { serialId: 1, basicAuth: SMARTBOX_GENERIC_BASIC_AUTH },
  "api-ehc": { serialId: 3, basicAuth: SMARTBOX_GENERIC_BASIC_AUTH },
  "api-climastar": { serialId: 5, basicAuth: SMARTBOX_GENERIC_BASIC_AUTH },
  "api-elnur": { serialId: 7, basicAuth: SMARTBOX_GENERIC_BASIC_AUTH },
  "api-hjm": { serialId: 10, basicAuth: SMARTBOX_GENERIC_BASIC_AUTH },
  "api-evconfort": { serialId: 12, basicAuth: SMARTBOX_GENERIC_BASIC_AUTH },
  "api-haverland": {
    serialId: 14,
    basicAuth: "NTU2ZDc0MWI3OGUzYmU5YjU2NjA3NTQ4OnZkaXZkaQ==",
  },
  "api-lhz": { serialId: 16, basicAuth: SMARTBOX_GENERIC_BASIC_AUTH },
};

export class SmartboxClient {
  constructor(username, password, apiName = "api") {
    this.username = username;
    this.password = password;
    this.apiName = apiName;
    this.apiHost = `https://${apiName}.helki.com`;
    this.accessToken = "";
    this.refreshToken = "";
    this.expiresAt = null;

    const reseller = RESELLERS[apiName] || RESELLERS["api"];
    this.basicAuth = reseller.basicAuth;
    this.serialId = reseller.serialId;
  }

  async authenticate() {
    const tokenUrl = `${this.apiHost}/client/token`;
    const headers = {
      Authorization: `Basic ${this.basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const params = new URLSearchParams();
    params.append("grant_type", "password");
    params.append("username", this.username);
    params.append("password", this.password);

    try {
      const response = await axios.post(tokenUrl, params, { headers });
      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
      this.expiresAt = new Date(Date.now() + response.data.expires_in * 1000);
      console.log("Authenticated successfully");
    } catch (error) {
      console.error("Authentication failed:", error.message);
      throw error;
    }
  }

  async checkRefreshAuth() {
    if (
      !this.accessToken ||
      (this.expiresAt && this.expiresAt - new Date() < 60000)
    ) {
      if (!this.accessToken) {
        await this.authenticate();
      } else {
        await this.refreshAuth();
      }
    }
  }

  async refreshAuth() {
    const tokenUrl = `${this.apiHost}/client/token`;
    const headers = {
      Authorization: `Basic ${this.basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", this.refreshToken);

    try {
      const response = await axios.post(tokenUrl, params, { headers });
      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
      this.expiresAt = new Date(Date.now() + response.data.expires_in * 1000);
    } catch (error) {
      console.error("Token refresh failed:", error.message);
      await this.authenticate();
    }
  }

  async apiRequest(path) {
    await this.checkRefreshAuth();
    const url = `${this.apiHost}/api/v2/${path}`;
    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
    };

    try {
      const response = await axios.get(url, { headers });
      return response.data;
    } catch (error) {
      console.error(`API request failed for ${path}:`, error.message);
      throw error;
    }
  }

  async apiPost(path, data) {
    await this.checkRefreshAuth();
    const url = `${this.apiHost}/api/v2/${path}`;
    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
    };

    try {
      console.log(`[SmartboxClient] POST ${url}`, data);
      const response = await axios.post(url, data, { headers });
      console.log(`[SmartboxClient] POST response:`, response.data);
      return response.data;
    } catch (error) {
      console.error(
        `[SmartboxClient] API post failed for ${path}:`,
        error.message,
      );
      if (error.response) {
        console.error(
          `[SmartboxClient] Response status:`,
          error.response.status,
        );
        console.error(`[SmartboxClient] Response data:`, error.response.data);
      }
      throw error;
    }
  }

  async getDevices() {
    return await this.apiRequest("devs");
  }

  async getNodes(deviceId) {
    const response = await this.apiRequest(`devs/${deviceId}/mgr/nodes`);
    return response.nodes;
  }

  async getNodeStatus(deviceId, node) {
    return await this.apiRequest(
      `devs/${deviceId}/${node.type}/${node.addr}/status`,
    );
  }

  async setNodeStatus(deviceId, node, statusData) {
    console.log(
      `[SmartboxClient] Setting node status: deviceId=${deviceId}, node=${node.type}/${node.addr}, data=`,
      statusData,
    );
    const result = await this.apiPost(
      `devs/${deviceId}/${node.type}/${node.addr}/status`,
      statusData,
    );
    console.log(`[SmartboxClient] Set node status result:`, result);
    return result;
  }

  async setMode(deviceId, node, mode) {
    console.log(`[SmartboxClient] setMode called: mode=${mode}`);
    const statusData = { mode };
    return await this.setNodeStatus(deviceId, node, statusData);
  }

  async setTemperature(deviceId, node, temperature, units = "C") {
    console.log(
      `[SmartboxClient] setTemperature called: temp=${temperature}, units=${units}`,
    );
    const statusData = {
      stemp: temperature.toString(),
      units,
    };
    return await this.setNodeStatus(deviceId, node, statusData);
  }
}
