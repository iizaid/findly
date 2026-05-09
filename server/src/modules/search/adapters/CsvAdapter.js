import { BaseAdapter } from './BaseAdapter.js';
import { AppError, errorCodes } from '../../../utils/AppError.js';

export class CsvAdapter extends BaseAdapter {
  static key = 'CSV';
  static label = 'CSV Import';
  static description = 'Future import adapter for user-provided spreadsheets and CSV lead lists.';
  static requiresApiKey = false;
  static comingSoon = true;
  static estimatedUseCase = 'Normalize uploaded business rows into Findly leads.';

  static isConfigured() {
    return false;
  }

  async run() {
    throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'CSV import is planned, but upload handling is not enabled yet.', 400);
  }
}
