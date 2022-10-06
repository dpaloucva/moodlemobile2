// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Component, OnInit, Optional } from '@angular/core';
import { CoreCourse, CoreCourseWSSection } from '@features/course/services/course';
import { CoreCourseModuleDelegate } from '@features/course/services/module-delegate';
import { CoreBlockBaseComponent } from '@features/block/classes/base-block-component';
import { CoreSites } from '@services/sites';
import { ContextLevel, CoreConstants } from '@/core/constants';
import { Translate } from '@singletons';
import { CoreUtils } from '@services/utils/utils';
import { CoreNavigator } from '@services/navigator';
import { CoreCourseHelper } from '@features/course/services/course-helper';
import { PageLoadsManager } from '@classes/page-loads-manager';
import { PageLoadWatcher } from '@classes/page-load-watcher';

/**
 * Component to render an "activity modules" block.
 */
@Component({
    selector: 'addon-block-activitymodules',
    templateUrl: 'addon-block-activitymodules.html',
    styleUrls: ['activitymodules.scss'],
})
export class AddonBlockActivityModulesComponent extends CoreBlockBaseComponent implements OnInit {

    entries: AddonBlockActivityModuleEntry[] = [];

    protected fetchContentDefaultError = 'Error getting activity modules data.';

    constructor(@Optional() loadsManager?: PageLoadsManager) {
        super('AddonBlockActivityModulesComponent', loadsManager);
    }

    /**
     * Perform the invalidate content function.
     *
     * @return Resolved when done.
     */
    async invalidateContent(): Promise<void> {
        await CoreCourse.invalidateSections(this.instanceId);
    }

    /**
     * @inheritdoc
     */
    protected async fetchContent(loadWatcher: PageLoadWatcher): Promise<void> {
        const sections = await loadWatcher.watchRequest(
            CoreCourse.getSectionsObservable(this.getCourseId(), {
                excludeContents: true,
                readingStrategy: loadWatcher.getReadingStrategy(),
            }),
            (prevSections, newSections) => this.sectionsHaveMeaningfulChanges(prevSections, newSections),
        );

        this.entries = await this.getEntriesFromSections(sections);
    }

    /**
     * Obtain the appropiate course id for the block.
     *
     * @return Course id.
     */
    protected getCourseId(): number {
        if (this.contextLevel == ContextLevel.COURSE) {
            return this.instanceId;
        }

        return CoreSites.getCurrentSiteHomeId();
    }

    /**
     * Given the course sections, return the module entries.
     *
     * @param sections Course sections.
     * @return Module entries.
     */
    protected async getEntriesFromSections(sections: CoreCourseWSSection[]): Promise<AddonBlockActivityModuleEntry[]> {
        const modulesData = this.getModulesDataFromSections(sections);

        return await Promise.all(Object.keys(modulesData.modFullNames).map(async (modName) => {
            const iconModName = modName === 'resources' ? 'page' : modName;

            const icon = await CoreCourseModuleDelegate.getModuleIconSrc(iconModName, modulesData.modIcons[iconModName]);

            return <AddonBlockActivityModuleEntry> {
                icon,
                iconModName,
                name: modulesData.modFullNames[modName],
                modName,
            };
        }));
    }

    /**
     * Given the course sections, return the label and default icon for each type of module in the course.
     *
     * @param sections Course sections.
     * @return Modules data.
     */
    protected getModulesDataFromSections(
        sections: CoreCourseWSSection[],
    ): { modIcons: Record<string, string>; modFullNames: Record<string, string> } {
        const modIcons: Record<string, string> = {};
        const archetypes: Record<string, number> = {};
        let modFullNames: Record<string, string> = {};

        sections.forEach((section) => {
            if (!section.modules) {
                return;
            }

            section.modules.forEach((mod) => {
                if (
                    !CoreCourseHelper.canUserViewModule(mod, section) ||
                    !CoreCourse.moduleHasView(mod) ||
                    modFullNames[mod.modname] !== undefined
                ) {
                    // Ignore this module.
                    return;
                }

                // Get the archetype of the module type.
                if (archetypes[mod.modname] === undefined) {
                    archetypes[mod.modname] = CoreCourseModuleDelegate.supportsFeature<number>(
                        mod.modname,
                        CoreConstants.FEATURE_MOD_ARCHETYPE,
                        CoreConstants.MOD_ARCHETYPE_OTHER,
                    );
                }

                // Get the full name of the module type.
                if (archetypes[mod.modname] == CoreConstants.MOD_ARCHETYPE_RESOURCE) {
                    // All resources are gathered in a single "Resources" option.
                    if (!modFullNames['resources']) {
                        modFullNames['resources'] = Translate.instant('core.resources');
                    }
                } else {
                    modFullNames[mod.modname] = mod.modplural;
                }

                modIcons[mod.modname] = mod.modicon;
            });
        });

        // Sort the modnames alphabetically.
        modFullNames = CoreUtils.sortValues(modFullNames);

        return { modFullNames, modIcons };
    }

    /**
     * Compare if the WS data has meaningful changes for the user.
     *
     * @param previousSections Previous sections.
     * @param newSections New sections.
     * @return Whether it has meaningful changes.
     */
    protected async sectionsHaveMeaningfulChanges(
        previousSections: CoreCourseWSSection[],
        newSections: CoreCourseWSSection[],
    ): Promise<boolean> {
        const prevModData = this.getModulesDataFromSections(previousSections);
        const newModData = this.getModulesDataFromSections(newSections);

        return JSON.stringify(Object.keys(prevModData.modFullNames)) !== JSON.stringify(Object.keys(newModData.modFullNames));
    }

    /**
     * Navigate to the activity list.
     *
     * @param entry Selected entry.
     */
    gotoCoureListModType(entry: AddonBlockActivityModuleEntry): void {
        CoreNavigator.navigateToSitePath('course/' + this.getCourseId() + '/list-mod-type', {
            params: {
                modName: entry.modName,
                title: entry.name,
            },
        });
    }

}

type AddonBlockActivityModuleEntry = {
    icon: string;
    name: string;
    modName: string;
    iconModName: string;
};
