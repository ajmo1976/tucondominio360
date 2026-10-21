import { Global, Module } from '@nestjs/common';
import { ModulesService } from './modules.service';
import { ModulesController } from './modules.controller';
import { TenantModulesController } from './modules.controller';
import { CondoModulesController } from './modules.controller';
import { ModuleEnabledGuard } from './module-enabled.guard';

@Global()
@Module({
  controllers: [ModulesController, TenantModulesController, CondoModulesController],
  providers: [ModulesService, ModuleEnabledGuard],
  exports: [ModulesService, ModuleEnabledGuard],
})
export class ModulesModule {}