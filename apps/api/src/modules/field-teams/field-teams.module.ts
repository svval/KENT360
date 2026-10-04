import { Module } from '@nestjs/common';
import { FieldTeamsController } from './field-teams.controller';
import { FieldTeamsService } from './field-teams.service';

@Module({
  controllers: [FieldTeamsController],
  providers: [FieldTeamsService],
  exports: [FieldTeamsService],
})
export class FieldTeamsModule {}
