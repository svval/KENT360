import { Global, Module } from '@nestjs/common';
import { ImageUploadService } from './image-upload.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [StorageService, ImageUploadService],
  exports: [StorageService, ImageUploadService],
})
export class StorageModule {}
