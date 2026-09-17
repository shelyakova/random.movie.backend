import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloudinaryService } from './cloudinary.service.js';
import { v2 as cloudinary } from 'cloudinary';

vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload_stream: vi.fn(),
      upload: vi.fn(),
      destroy: vi.fn(),
    },
  },
}));

describe('CloudinaryService', () => {
  let cloudinaryService: CloudinaryService;

  beforeEach(() => {
    vi.clearAllMocks();
    cloudinaryService = new CloudinaryService();
  });

  describe('uploadImage', () => {
    const secureUrl = 'https://res.cloudinary.com/test/image/upload/poster.png';
    const publicId = 'movie-list-posters/poster';
    const file = { buffer: Buffer.from('test') } as Express.Multer.File;

    it('uploads the file buffer to the movie-list-posters folder and resolves with the url and publicId', async () => {
      const uploadStreamMock = cloudinary.uploader.upload_stream as ReturnType<typeof vi.fn>;
      const endMock = vi.fn();
      uploadStreamMock.mockImplementation((_options, callback) => {
        callback(null, { secure_url: secureUrl, public_id: publicId });
        return { end: endMock };
      });

      const result = await cloudinaryService.uploadImage(file);

      expect(uploadStreamMock).toHaveBeenCalledWith(
        { folder: 'movie-list-posters' },
        expect.any(Function),
      );
      expect(endMock).toHaveBeenCalledWith(file.buffer);
      expect(result).toEqual({ url: secureUrl, publicId });
    });

    it('rejects when the upload_stream callback receives an error', async () => {
      const uploadStreamMock = cloudinary.uploader.upload_stream as ReturnType<typeof vi.fn>;
      const error = new Error('Cloudinary upload failed');
      uploadStreamMock.mockImplementation((_options, callback) => {
        callback(error, undefined);
        return { end: vi.fn() };
      });

      await expect(cloudinaryService.uploadImage(file)).rejects.toThrow(error);
    });
  });

  describe('uploadImageFromUrl', () => {
    const url = 'https://example.com/poster.png';
    const secureUrl = 'https://res.cloudinary.com/test/image/upload/poster.png';
    const publicId = 'movie-list-posters/poster';

    it('uploads the given url to the movie-list-posters folder and resolves with the url and publicId', async () => {
      (cloudinary.uploader.upload as ReturnType<typeof vi.fn>).mockResolvedValue({
        secure_url: secureUrl,
        public_id: publicId,
      });

      const result = await cloudinaryService.uploadImageFromUrl(url);

      expect(cloudinary.uploader.upload).toHaveBeenCalledWith(url, {
        folder: 'movie-list-posters',
      });
      expect(result).toEqual({ url: secureUrl, publicId });
    });

    it('propagates the rejection when the upload call rejects', async () => {
      const error = new Error('Cloudinary upload failed');
      (cloudinary.uploader.upload as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(cloudinaryService.uploadImageFromUrl(url)).rejects.toThrow(error);
    });
  });

  describe('deleteImage', () => {
    it('calls cloudinary.uploader.destroy with the given publicId', async () => {
      const publicId = 'movie-list-posters/poster';
      (cloudinary.uploader.destroy as ReturnType<typeof vi.fn>).mockResolvedValue({ result: 'ok' });

      await cloudinaryService.deleteImage(publicId);

      expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(publicId);
    });

    it('propagates the rejection when the destroy call rejects', async () => {
      const error = new Error('Cloudinary destroy failed');
      (cloudinary.uploader.destroy as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(cloudinaryService.deleteImage('some-public-id')).rejects.toThrow(error);
    });
  });
});
