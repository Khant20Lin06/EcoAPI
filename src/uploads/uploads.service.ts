import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PresignUploadDto } from './dto/presign.dto';

@Injectable()
export class UploadsService {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('S3_ENDPOINT') ?? 'http://localhost:9000';
    const region = this.config.get<string>('S3_REGION') ?? 'us-east-1';
    const configuredAccessKeyId = this.config.get<string>('S3_ACCESS_KEY');
    const configuredSecretAccessKey = this.config.get<string>('S3_SECRET_KEY');
    const isLocalEndpoint =
      endpoint.includes('localhost') ||
      endpoint.includes('127.0.0.1') ||
      endpoint.includes('minio');
    const accessKeyId = configuredAccessKeyId ?? (isLocalEndpoint ? 'minioadmin' : undefined);
    const secretAccessKey =
      configuredSecretAccessKey ?? (isLocalEndpoint ? 'minioadmin' : undefined);

    this.bucket = this.config.get<string>('S3_BUCKET') ?? 'eco-uploads';
    this.s3 = new S3Client({
      region,
      endpoint,
      forcePathStyle: true,
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined
    });
  }

  async presign(payload: PresignUploadDto, userId?: string) {
    const maxBytes = Number(this.config.get('UPLOAD_MAX_BYTES') ?? 5 * 1024 * 1024);
    if (payload.size > maxBytes) {
      throw new BadRequestException('File too large');
    }

    const allowedTypes = (this.config.get<string>('UPLOAD_ALLOWED_TYPES') ??
      'image/jpeg,image/png,image/webp').split(',');

    if (!allowedTypes.includes(payload.contentType)) {
      throw new BadRequestException('Unsupported file type');
    }

    const safeName = payload.filename.replace(/[^a-zA-Z0-9._-]/g, '');
    const prefix = userId ? `uploads/${userId}` : 'uploads/public';
    const key = `${prefix}/${Date.now()}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: payload.contentType
    });

    const expiresIn = 60 * 5;
    let url: string;
    try {
      url = await getSignedUrl(this.s3, command, { expiresIn });
    } catch {
      throw new BadRequestException(
        'Upload service is not configured. Set S3 endpoint and credentials.'
      );
    }
    let publicUrl = url;
    try {
      const parsed = new URL(url);
      parsed.search = '';
      publicUrl = parsed.toString();
    } catch {
      publicUrl = url;
    }

    return { url, key, bucket: this.bucket, expiresIn, publicUrl };
  }
}
