import axios from "axios";
import { createLogger } from "./logger.js";

const log = createLogger("SmartboxClient");

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
      log.info("Authenticated successfully");
    } catch (error) {
      log.error({ err: error }, "Authentication failed");
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
      log.warn({ err: error }, "Token refresh failed, re-authenticating");
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
      log.error({ err: error, path }, "API request failed");
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
      log.debug({ path, data }, "POST request");
      const response = await axios.post(url, data, { headers });
      log.debug({ path, response: response.data }, "POST response");
      return response.data;
    } catch (error) {
      log.error(
        {
          err: error,
          path,
          status: error.response?.status,
          responseData: error.response?.data,
        },
        "API POST failed",
      );
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
    log.debug(
      { deviceId, nodeType: node.type, nodeAddr: node.addr, statusData },
      "Setting node status",
    );
    const result = await this.apiPost(
      `devs/${deviceId}/${node.type}/${node.addr}/status`,
      statusData,
    );
    return result;
  }

  async setMode(deviceId, node, mode) {
    log.info(
      { mode, nodeType: node.type, nodeAddr: node.addr },
      "Setting mode",
    );
    const statusData = { mode };
    return await this.setNodeStatus(deviceId, node, statusData);
  }

  async setTemperature(deviceId, node, temperature, units = "C") {
    log.info(
      { temperature, units, nodeType: node.type, nodeAddr: node.addr },
      "Setting temperature",
    );
    const statusData = {
      stemp: Number(temperature).toFixed(1),
      units,
    };
    return await this.setNodeStatus(deviceId, node, statusData);
  }
}
