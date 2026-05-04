import { Global, Module } from '@nestjs/common';
import { SeedService } from './seed.service';
import { DataStoreService } from './data-store.service';

@Global()
@Module({
  providers: [SeedService, DataStoreService],
  exports: [SeedService, DataStoreService],
})
export class SeedModule {}
