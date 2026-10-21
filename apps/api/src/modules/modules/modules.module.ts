import { Module } from '@nestjs/common';
import { ModulesService } from './modules.service';
import { ModulesController } from './modules.controller';
import { TenantModulesController } from './modules.controller';
import { CondoModulesController } from './modules.controller';

@Module({
  controllers: [ModulesController, TenantModulesController, CondoModulesController],
  providers: [ModulesService],
  exports: [ModulesService],
})
export class ModulesModule {}