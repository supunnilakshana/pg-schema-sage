import { KeycloakConfig, KeycloakToken } from '../types/postgrest.js';

export class KeycloakAuthService {
  private config: KeycloakConfig;
  private cachedToken: KeycloakToken | null = null;
  private tokenExpirationTime: number = 0;

  constructor(config: KeycloakConfig) {
    this.config = {
      ...config,
      realm: config.realm || 'master'
    };
  }

  async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.isTokenValid()) {
      return this.cachedToken.access_token;
    }

    const token = await this.authenticate();
    this.cachedToken = token;
    this.tokenExpirationTime = Date.now() + (token.expires_in * 1000) - 60000; // 1 minute buffer
    
    return token.access_token;
  }

  private async authenticate(): Promise<KeycloakToken> {
    const tokenUrl = `${this.config.url}/realms/${this.config.realm}/protocol/openid-connect/token`;
    
    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: this.config.clientId,
      username: this.config.username,
      password: this.config.password,
    });

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Keycloak authentication failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const token: KeycloakToken = await response.json();
      
      if (!token.access_token) {
        throw new Error('No access token received from Keycloak');
      }

      return token;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to authenticate with Keycloak: ${error.message}`);
      }
      throw new Error('Failed to authenticate with Keycloak: Unknown error');
    }
  }

  private isTokenValid(): boolean {
    return this.cachedToken !== null && Date.now() < this.tokenExpirationTime;
  }

  async refreshToken(): Promise<string> {
    if (!this.cachedToken?.refresh_token) {
      return this.getAccessToken();
    }

    const tokenUrl = `${this.config.url}/realms/${this.config.realm}/protocol/openid-connect/token`;
    
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      refresh_token: this.cachedToken.refresh_token,
    });

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });

      if (!response.ok) {
        // If refresh fails, fall back to password authentication
        return this.getAccessToken();
      }

      const token: KeycloakToken = await response.json();
      this.cachedToken = token;
      this.tokenExpirationTime = Date.now() + (token.expires_in * 1000) - 60000;
      
      return token.access_token;
    } catch (error) {
      // If refresh fails, fall back to password authentication
      return this.getAccessToken();
    }
  }

  async validateToken(token: string): Promise<boolean> {
    const introspectUrl = `${this.config.url}/realms/${this.config.realm}/protocol/openid-connect/token/introspect`;
    
    const params = new URLSearchParams({
      token,
      client_id: this.config.clientId,
    });

    try {
      const response = await fetch(introspectUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });

      if (!response.ok) {
        return false;
      }

      const result = await response.json();
      return result.active === true;
    } catch (error) {
      return false;
    }
  }

  async getUserInfo(token: string): Promise<any> {
    const userInfoUrl = `${this.config.url}/realms/${this.config.realm}/protocol/openid-connect/userinfo`;
    
    try {
      const response = await fetch(userInfoUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get user info: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get user info: ${error.message}`);
      }
      throw new Error('Failed to get user info: Unknown error');
    }
  }

  async logout(token: string): Promise<void> {
    const logoutUrl = `${this.config.url}/realms/${this.config.realm}/protocol/openid-connect/logout`;
    
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      refresh_token: this.cachedToken?.refresh_token || '',
    });

    try {
      await fetch(logoutUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${token}`,
        },
        body: params,
      });
    } catch (error) {
      // Ignore logout errors
    } finally {
      this.cachedToken = null;
      this.tokenExpirationTime = 0;
    }
  }

  clearCache(): void {
    this.cachedToken = null;
    this.tokenExpirationTime = 0;
  }
}