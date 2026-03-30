import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { PrismaModule } from './prisma/index.js';
import { SlackModule } from './slack/index.js';
import { DashboardModule } from './dashboard/index.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'dashboard', 'dist'),
      exclude: ['/api*'],
    }),
    PrismaModule,
    SlackModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
