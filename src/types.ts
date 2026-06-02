/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UserProfile {
  email: string;
  createdAt: Date;
}

export interface ClientFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: Date;
  ownerId: string;
  content: string; // Base64 data url
}

export enum AuthMode {
  SIGN_IN = 'SIGN_IN',
  SIGN_UP = 'SIGN_UP',
}
