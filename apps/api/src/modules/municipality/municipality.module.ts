import { Module } from '@nestjs/common';
import { MunicipalityController } from './municipality.controller';
import { MunicipalityService } from './municipality.service';

@Module({
  controllers: [MunicipalityController],
  providers: [MunicipalityService],
})
export class MunicipalityModule {}
