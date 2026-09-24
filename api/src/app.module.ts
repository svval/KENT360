import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Request } from './requests/request.entity';
import { RequestsController } from './requests/requests.controller';
import { RequestsService } from './requests/requests.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'kent360.sqlite',
      entities: [Request],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([Request]),
  ],
  controllers: [AppController, RequestsController],
  providers: [AppService, RequestsService],
})
export class AppModule {}