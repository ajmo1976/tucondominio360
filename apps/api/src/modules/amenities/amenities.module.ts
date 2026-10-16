import { Module } from '@nestjs/common';
import { AmenitiesController } from './amenities.controller';
import { AmenitiesService } from './amenities.service';

@Module({
  controllers: [AmenitiesController],
  providers: [AmenitiesService],
  exports: [AmenitiesService],
})
export class AmenitiesModule {}
