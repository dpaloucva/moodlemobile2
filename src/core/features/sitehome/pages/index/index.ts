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

import { Component, OnDestroy, OnInit } from '@angular/core';
import { IonRefresher } from '@ionic/angular';
import { Params } from '@angular/router';

import { CoreSite, CoreSiteConfig } from '@classes/site';
import { CoreCourse, CoreCourseWSSection } from '@features/course/services/course';
import { CoreDomUtils } from '@services/utils/dom';
import { CoreSites } from '@services/sites';
import { CoreSiteHome } from '@features/sitehome/services/sitehome';
import { CoreCourses } from '@features//courses/services/courses';
import { CoreEventObserver, CoreEvents } from '@singletons/events';
import { CoreCourseHelper, CoreCourseModuleData } from '@features/course/services/course-helper';
import { CoreCourseModuleDelegate } from '@features/course/services/module-delegate';
import { CoreCourseModulePrefetchDelegate } from '@features/course/services/module-prefetch-delegate';
import { CoreNavigationOptions, CoreNavigator } from '@services/navigator';
import { CoreBlockHelper } from '@features/block/services/block-helper';
import { CoreUtils } from '@services/utils/utils';
import { AsyncComponent } from '@classes/async-component';
import { PageLoadsManager } from '@classes/page-loads-manager';
import { CorePromisedValue } from '@classes/promised-value';
import { Subscription } from 'rxjs';
import { PageLoadWatcher } from '@classes/page-load-watcher';

/**
 * Page that displays site home index.
 */
@Component({
    selector: 'page-core-sitehome-index',
    templateUrl: 'index.html',
    styleUrls: ['index.scss'],
    providers: [{
        provide: PageLoadsManager,
        useClass: PageLoadsManager,
    }],
})
export class CoreSiteHomeIndexPage implements OnInit, OnDestroy, AsyncComponent {

    showLoading = true;
    section?: CoreCourseWSSection & {
        hasContent?: boolean;
    };

    hasContent = false;
    hasBlocks = false;
    items: string[] = [];
    siteHomeId = 1;
    currentSite!: CoreSite;
    searchEnabled = false;
    newsForumModule?: CoreCourseModuleData;

    protected updateSiteObserver: CoreEventObserver;
    protected fetchSuccess = false;
    protected onReadyPromise = new CorePromisedValue<void>();
    protected loadsManagerSubscription: Subscription;

    constructor(protected loadsManager: PageLoadsManager) {
        // Refresh the enabled flags if site is updated.
        this.updateSiteObserver = CoreEvents.on(CoreEvents.SITE_UPDATED, () => {
            this.searchEnabled = !CoreCourses.isSearchCoursesDisabledInSite();
        }, CoreSites.getCurrentSiteId());

        this.loadsManagerSubscription = this.loadsManager.onRefreshPage.subscribe(() => {
            this.showLoading = true;
            this.loadContent();
        });
    }

    /**
     * @inheritdoc
     */
    ngOnInit(): void {
        this.searchEnabled = !CoreCourses.isSearchCoursesDisabledInSite();

        this.currentSite = CoreSites.getRequiredCurrentSite();
        this.siteHomeId = CoreSites.getCurrentSiteHomeId();

        const module = CoreNavigator.getRouteParam<CoreCourseModuleData>('module');
        if (module) {
            let modNavOptions = CoreNavigator.getRouteParam<CoreNavigationOptions>('modNavOptions');
            if (!modNavOptions) {
                // Fallback to old way of passing params. @deprecated since 4.0.
                const modParams = CoreNavigator.getRouteParam<Params>('modParams');
                if (modParams) {
                    modNavOptions = { params: modParams };
                }
            }
            CoreCourseHelper.openModule(module, this.siteHomeId, { modNavOptions });
        }

        this.loadContent(true);
    }

    /**
     * Convenience function to fetch the data.
     *
     * @param firstLoad Whether it's the first load.
     * @return Promise resolved when done.
     */
    protected async loadContent(firstLoad = false): Promise<void> {
        const loadWatcher = this.loadsManager.startPageLoad(this, !!firstLoad);
        this.hasContent = false;

        const config = this.currentSite.getStoredConfig() || { numsections: '1', frontpageloggedin: '' };

        this.items = await CoreSiteHome.getFrontPageItems(config.frontpageloggedin);
        this.hasContent = this.items.length > 0;

        const promises: Promise<unknown>[] = [
            this.loadSectionsContent(loadWatcher, config),
            this.loadHasBlocks(loadWatcher),
        ];

        if (this.items.includes('NEWS_ITEMS')) {
            promises.push(this.loadNewsForum(loadWatcher));
        }

        try {
            await Promise.all(promises);

            if (!this.fetchSuccess) {
                this.fetchSuccess = true;
                CoreUtils.ignoreErrors(CoreCourse.logView(
                    this.siteHomeId,
                    undefined,
                    undefined,
                    this.currentSite.getInfo()?.sitename,
                ));
            }
        } catch (error) {
            CoreDomUtils.showErrorModalDefault(error, 'core.course.couldnotloadsectioncontent', true);
        }

        this.showLoading = false;
        this.onReadyPromise.resolve();
    }

    /**
     * Load news forum.
     *
     * @param loadWatcher To manage the requests.
     */
    protected async loadNewsForum(loadWatcher: PageLoadWatcher): Promise<void> {
        try {
            const forum = await loadWatcher.watchRequest(
                CoreSiteHome.getNewsForumObservable(this.siteHomeId, { readingStrategy: loadWatcher.getReadingStrategy() }),
            );

            this.newsForumModule = await loadWatcher.watchRequest(
                CoreCourse.getModuleObservable(forum.cmid, {
                    courseId: forum.course,
                    readingStrategy: loadWatcher.getReadingStrategy(),
                }),
                (prevModule, newModule) => this.moduleHasMeaningfulChanges(prevModule, newModule),
            );
            this.newsForumModule.handlerData = await CoreCourseModuleDelegate.getModuleDataFor(
                this.newsForumModule.modname,
                this.newsForumModule,
                this.siteHomeId,
                undefined,
                true,
            );
        } catch {
            // Ignore errors.
        }
    }

    /**
     * Load the content of the sections.
     *
     * @param loadWatcher To manage the requests.
     * @param config Site config.
     */
    protected async loadSectionsContent(loadWatcher: PageLoadWatcher, config: CoreSiteConfig): Promise<void> {
        const sections = await loadWatcher.watchRequest(
            CoreCourse.getSectionsObservable(this.siteHomeId, {
                excludeContents: true,
                readingStrategy: loadWatcher.getReadingStrategy(),
            }),
            (prevSections, newSections) => this.sectionsHaveMeaningfulChanges(config, prevSections, newSections),
        );

        // Check "Include a topic section" setting from numsections.
        this.section = Number(config.numsections) ? sections.find((section) => section.section === 1) : undefined;
        if (this.section) {
            const result = await CoreCourseHelper.addHandlerDataForModules(
                [this.section],
                this.siteHomeId,
                undefined,
                undefined,
                true,
            );

            this.section.hasContent = result.hasContent;
            this.hasContent = result.hasContent || this.hasContent;
        }
    }

    /**
     * Load whether the site home has blocks.
     *
     * @param loadWatcher To manage the requests.
     */
    protected async loadHasBlocks(loadWatcher: PageLoadWatcher): Promise<void> {
        try {
            this.hasBlocks = await loadWatcher.watchRequest(
                CoreBlockHelper.hasCourseBlocksObservable(this.siteHomeId, { readingStrategy: loadWatcher.getReadingStrategy() }),
            );
        } catch {
            this.hasBlocks = false;
        }
    }

    /**
     * Refresh the data.
     *
     * @param refresher Refresher.
     */
    doRefresh(refresher?: IonRefresher): void {
        const promises: Promise<unknown>[] = [];

        promises.push(CoreCourse.invalidateSections(this.siteHomeId));
        promises.push(this.currentSite.invalidateConfig().then(async () => {
            // Config invalidated, fetch it again.
            const config: CoreSiteConfig = await this.currentSite.getConfig();
            this.currentSite.setConfig(config);

            return;
        }));

        promises.push(CoreCourse.invalidateCourseBlocks(this.siteHomeId));
        promises.push(CoreSiteHome.invalidateNewsForum(this.siteHomeId));

        if (this.section && this.section.modules) {
            // Invalidate modules prefetch data.
            promises.push(CoreCourseModulePrefetchDelegate.invalidateModules(this.section.modules, this.siteHomeId));
        }

        Promise.all(promises).finally(async () => {
            await this.loadContent().finally(() => {
                refresher?.complete();
            });
        });
    }

    /**
     * Go to search courses.
     */
    openSearch(): void {
        CoreNavigator.navigateToSitePath('courses/list', { params : { mode: 'search' } });
    }

    /**
     * Go to available courses.
     */
    openAvailableCourses(): void {
        CoreNavigator.navigateToSitePath('courses/list', { params : { mode: 'all' } });
    }

    /**
     * Go to my courses.
     */
    openMyCourses(): void {
        CoreNavigator.navigateToSitePath('courses/list', { params : { mode: 'my' } });
    }

    /**
     * Go to course categories.
     */
    openCourseCategories(): void {
        CoreNavigator.navigateToSitePath('courses/categories');
    }

    /**
     * Compare if the WS data has meaningful changes for the user.
     *
     * @param previousSections Previous sections.
     * @param newSections New sections.
     * @return Whether it has meaningful changes.
     */
    protected async sectionsHaveMeaningfulChanges(
        config: CoreSiteConfig,
        previousSections: CoreCourseWSSection[],
        newSections: CoreCourseWSSection[],
    ): Promise<boolean> {
        if (!Number(config.numsections)) {
            return false;
        }

        const previousSection = previousSections.find((section) => section.section === 1);
        const newSection = newSections.find((section) => section.section === 1);

        if (!previousSection || !newSection) {
            return (previousSection || newSection) ? true : false;
        }

        if (previousSection.summary !== newSection.summary || previousSection.modules.length !== newSection.modules.length) {
            return true;
        }

        const modulesChangedValues = await Promise.all(
            previousSection.modules.map((prevModule, i) => this.moduleHasMeaningfulChanges(prevModule, newSection.modules[i])),
        );

        return modulesChangedValues.includes(true);
    }

    /**
     * Compare if the WS data has meaningful changes for the user.
     *
     * @param previousModule Previous module.
     * @param newModule New module.
     * @return Whether it has meaningful changes.
     */
    protected async moduleHasMeaningfulChanges(
        previousModule: CoreCourseModuleData,
        newModule: CoreCourseModuleData,
    ): Promise<boolean> {
        return previousModule.name.trim() !== newModule.name.trim() ||
            previousModule.visible !== newModule.visible ||
            previousModule.uservisible !== newModule.uservisible ||
            previousModule.description?.trim() !== newModule.description?.trim();
    }

    /**
     * @inheritdoc
     */
    async ready(): Promise<void> {
        return await this.onReadyPromise;
    }

    /**
     * Component being destroyed.
     */
    ngOnDestroy(): void {
        this.updateSiteObserver.off();
        this.loadsManagerSubscription.unsubscribe();
    }

}
