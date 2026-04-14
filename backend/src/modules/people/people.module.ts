import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Person } from '../../database/entities/person.entity.js';
import { PeopleController, FirmPeopleController } from './people.controller.js';
import { PeopleService } from './people.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Person])],
  controllers: [PeopleController, FirmPeopleController],
  providers: [PeopleService],
  exports: [PeopleService],
})
export class PeopleModule {}
