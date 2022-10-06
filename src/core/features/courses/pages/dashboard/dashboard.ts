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

import { Component, OnDestroy, OnInit, QueryList, ViewChildren } from '@angular/core';
import { IonRefresher } from '@ionic/angular';

import { CoreCourses } from '../../services/courses';
import { CoreEventObserver, CoreEvents } from '@singletons/events';
import { CoreSites } from '@services/sites';
import { CoreCoursesDashboard, CoreCoursesDashboardBlocks } from '@features/courses/services/dashboard';
import { CoreDomUtils } from '@services/utils/dom';
import { CoreCourseBlock } from '@features/course/services/course';
import { CoreBlockComponent } from '@features/block/components/block/block';
import { CoreNavigator } from '@services/navigator';
import { CoreBlockDelegate } from '@features/block/services/block-delegate';
import { PageLoadsManager } from '@classes/page-loads-manager';
import { Subscription } from 'rxjs';
import { CorePromisedValue } from '@classes/promised-value';
import { AsyncComponent } from '@classes/async-component';

/**
 * Page that displays the dashboard page.
 */
@Component({
    selector: 'page-core-courses-dashboard',
    templateUrl: 'dashboard.html',
    providers: [{
        provide: PageLoadsManager,
        useClass: PageLoadsManager,
    }],
})
export class CoreCoursesDashboardPage implements OnInit, OnDestroy, AsyncComponent {

    @ViewChildren(CoreBlockComponent) blocksComponents?: QueryList<CoreBlockComponent>;

    hasMainBlocks = false;
    hasSideBlocks = false;
    searchEnabled = false;
    downloadCourseEnabled = false;
    downloadCoursesEnabled = false;
    userId?: number;
    blocks: Partial<CoreCourseBlock>[] = [];
    showLoading = true;

    protected updateSiteObserver: CoreEventObserver;
    protected onReadyPromise = new CorePromisedValue<void>();
    protected loadsManagerSubscription: Subscription;

    constructor(protected loadsManager: PageLoadsManager) {
        // Refresh the enabled flags if site is updated.
        this.updateSiteObserver = CoreEvents.on(CoreEvents.SITE_UPDATED, () => {
            this.searchEnabled = !CoreCourses.isSearchCoursesDisabledInSite();
            this.downloadCourseEnabled = !CoreCourses.isDownloadCourseDisabledInSite();
            this.downloadCoursesEnabled = !CoreCourses.isDownloadCoursesDisabledInSite();

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
        this.downloadCourseEnabled = !CoreCourses.isDownloadCourseDisabledInSite();
        this.downloadCoursesEnabled = !CoreCourses.isDownloadCoursesDisabledInSite();

        this.loadContent(true);
    }

    /**
     * Convenience function to fetch the dashboard data.
     *
     * @return Promise resolved when done.
     */
    protected async loadContent(firstLoad = false): Promise<void> {
        const loadWatcher = this.loadsManager.startPageLoad(this, !!firstLoad);

        const available = await CoreCoursesDashboard.isAvailable();
        const disabled = await CoreCoursesDashboard.isDisabled();

        if (available && !disabled) {
            this.userId = CoreSites.getCurrentSiteUserId();

            try {
                const blocks = await loadWatcher.watchRequest(
                    CoreCoursesDashboard.getDashboardBlocksObservable({
                        readingStrategy: loadWatcher.getReadingStrategy(),
                    }),
                    (prevBlocks, newBlocks) => this.blocksHaveMeaningfulChanges(prevBlocks, newBlocks),
                );

                this.blocks = blocks.mainBlocks;
                console.error('BLOCKS', this.blocks);
                (<any>window).blocks = this.blocks;

                this.hasMainBlocks = CoreBlockDelegate.hasSupportedBlock(blocks.mainBlocks);
                this.hasSideBlocks = CoreBlockDelegate.hasSupportedBlock(blocks.sideBlocks);
            } catch (error) {
                CoreDomUtils.showErrorModal(error);

                // Cannot get the blocks, just show dashboard if needed.
                this.loadFallbackBlocks();
            }
        } else if (!available) {
            // Not available, but not disabled either. Use fallback.
            this.loadFallbackBlocks();
        } else {
            // Disabled.
            this.blocks = [];
        }

        this.showLoading = false;
        this.onReadyPromise.resolve();
    }

    /**
     * Load fallback blocks to shown before 3.6 when dashboard blocks are not supported.
     */
    protected loadFallbackBlocks(): void {
        this.blocks = [
            {
                name: 'myoverview',
                visible: true,
            },
            {
                name: 'timeline',
                visible: true,
            },
        ];
    }

    /**
     * Refresh the dashboard data.
     *
     * @param refresher Refresher.
     */
    refreshDashboard(refresher: IonRefresher): void {
        const promises: Promise<void>[] = [];

        promises.push(CoreCoursesDashboard.invalidateDashboardBlocks());

        // Invalidate the blocks.
        this.blocksComponents?.forEach((blockComponent) => {
            promises.push(blockComponent.invalidate().catch(() => {
                // Ignore errors.
            }));
        });

        Promise.all(promises).finally(() => {
            this.loadContent().finally(() => {
                refresher?.complete();
            });
        });
    }

    /**
     * Go to search courses.
     */
    async openSearch(): Promise<void> {
        CoreNavigator.navigateToSitePath('/courses/list', { params : { mode: 'search' } });
    }

    /**
     * Compare if the WS data has meaningful changes for the user.
     *
     * @param previousBlocks Previous blocks.
     * @param newBlocks New blocks.
     * @return Whether it has meaningful changes.
     */
    protected async blocksHaveMeaningfulChanges(
        previousBlocks: CoreCoursesDashboardBlocks,
        newBlocks: CoreCoursesDashboardBlocks,
    ): Promise<boolean> {
        if (previousBlocks.mainBlocks.length !== newBlocks.mainBlocks.length) {
            return true;
        }

        const previousMainBlocks = Array.from(previousBlocks.mainBlocks).sort((a, b) => a.name.localeCompare(b.name));
        const newMainBlocks = Array.from(newBlocks.mainBlocks).sort((a, b) => a.name.localeCompare(b.name));
        console.error('PREV BLOCKS', previousMainBlocks);
        console.error('new BLOCKS', newMainBlocks);

        const haveChangesResults = await Promise.all(previousMainBlocks.map((previousBlock, index) => {
            const newBlock = newMainBlocks[index];

            if (previousBlock.name !== newBlock.name) {
                return true;
            }

            return CoreBlockDelegate.blockHasMeaningfulChanges(previousBlock, newBlock, 'user', this.userId ?? 0);
        }));
        console.error('RESULTS', haveChangesResults);

        return haveChangesResults.includes(true);
    }

    /**
     * Component being destroyed.
     */
    ngOnDestroy(): void {
        this.updateSiteObserver.off();
    }

    /**
     * @inheritdoc
     */
    async ready(): Promise<void> {
        return await this.onReadyPromise;
    }

}
