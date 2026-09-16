import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloudinaryService } from './cloudinary.service.js';
import { v2 as cloudinary } from 'cloudinary';

vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload_stream: vi.fn(),
      upload: vi.fn(),
    },
  },
}));

describe('CloudinaryService', () => {
  let cloudinaryService: CloudinaryService;

  beforeEach(() => {
    vi.clearAllMocks();
    cloudinaryService = new CloudinaryService();
  });

  describe('uploadImageFromUrl', () => {
    const url = 'https://example.com/poster.png';
    const secureUrl = 'https://res.cloudinary.com/test/image/upload/poster.png';

    it('uploads the given url to the movie-list-posters folder and returns the secure_url', async () => {
      (cloudinary.uploader.upload as ReturnType<typeof vi.fn>).mockResolvedValue({
        secure_url: secureUrl,
      });

      const result = await cloudinaryService.uploadImageFromUrl(url);

      expect(cloudinary.uploader.upload).toHaveBeenCalledWith(url, {
        folder: 'movie-list-posters',
      });
      expect(result).toBe(secureUrl);
    });

    it('propagates the rejection when the upload call rejects', async () => {
      const error = new Error('Cloudinary upload failed');
      (cloudinary.uploader.upload as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(cloudinaryService.uploadImageFromUrl(url)).rejects.toThrow(error);
    });
  });
});
