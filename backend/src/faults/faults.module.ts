import { Module } from '@nestjs/common';
import { FaultsService } from './faults.service';

@Module({
  providers: [FaultsService]
})
export class FaultsModule {}
