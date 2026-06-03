/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UserProfile {
  email: string;
  createdAt: Date;
  name?: string;
}

export interface ClientFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: Date;
  ownerId: string;
  content: string; // Base64 data url
  tags?: string[];
}

export interface ActivityLog {
  id: string;
  ownerId: string;
  action: 'UPLOAD' | 'DELETE' | 'TAG_UPDATE' | 'SHARE_GENERATE';
  fileName: string;
  details: string;
  timestamp: Date;
}

export enum AuthMode {
  SIGN_IN = 'SIGN_IN',
  SIGN_UP = 'SIGN_UP',
}
