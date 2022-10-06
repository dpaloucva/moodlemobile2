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

import { Injectable, Type } from '@angular/core';
import { CoreSites } from '@services/sites';
import { CoreDelegate, CoreDelegateHandler } from '@classes/delegate';
import { CoreSite } from '@classes/site';
import { Subject } from 'rxjs';
import { CoreCourseBlock } from '@features/course/services/course';
import { Params } from '@angular/router';
import { makeSingleton } from '@singletons';
import { CoreBlockDefaultHandler } from './handlers/default-block';
import { CoreNavigationOptions } from '@services/navigator';
import type { ICoreBlockComponent } from '@features/block/classes/base-block-component';
import { CoreBlockOnlyTitleComponent } from '../components/only-title-block/only-title-block';
import { CoreObject } from '@singletons/object';
import { CoreBlockPreRenderedComponent } from '../components/pre-rendered-block/pre-rendered-block';
import { CoreUtils } from '@services/utils/utils';

/**
 * Interface that all blocks must implement.
 */
export interface CoreBlockHandler extends CoreDelegateHandler {
    /**
     * Name of the block the handler supports. E.g. 'activity_modules'.
     */
    blockName: string;

    /**
     * Returns the data needed to render the block.
     *
     * @param block The block to render.
     * @param contextLevel The context where the block will be used.
     * @param instanceId The instance ID associated with the context level.
     * @return Data or promise resolved with the data.
     */
    getDisplayData?(
        block: CoreCourseBlock,
        contextLevel: string,
        instanceId: number,
    ): undefined | CoreBlockHandlerData | Promise<CoreBlockHandlerData>;

    /**
     * Compare 2 blocks of the same type to check if there are meaningful changes between them. This function is used to
     * check if a block has changed.
     * Prerendered and only title blocks don't need to implement this function.
     *
     * @param blockA First block.
     * @param blockB Second block.
     * @return Whether there are meaningful changes.
     */
    blockHasMeaningfulChanges?(blockA: CoreCourseBlock, blockB: CoreCourseBlock): Promise<boolean>;
}

/**
 * Data needed to render a block. It's returned by the handler.
 */
export interface CoreBlockHandlerData {
    /**
     * Title to display for the block.
     */
    title: string;

    /**
     * Class to add to the displayed block.
     */
    class?: string;

    /**
     * The component to render the contents of the block.
     * It's recommended to return the class of the component, but you can also return an instance of the component.
     */
    component: Type<ICoreBlockComponent>;

    /**
     * Data to pass to the component. All the properties in this object will be passed to the component as inputs.
     */
    componentData?: Record<string | number, unknown>;

    /**
     * Link to go when showing only title.
     */
    link?: string;

    /**
     * Params of the link.
     */
    linkParams?: Params;

    /**
     * Navigation options.
     */
    navOptions?: CoreNavigationOptions;
}

/**
 * Delegate to register block handlers.
 */
@Injectable({ providedIn: 'root' })
export class CoreBlockDelegateService extends CoreDelegate<CoreBlockHandler> {

    protected handlerNameProperty = 'blockName';

    protected featurePrefix = 'CoreBlockDelegate_';

    blocksUpdateObservable: Subject<void>;

    constructor(
        protected defaultHandler: CoreBlockDefaultHandler,
    ) {
        super('CoreBlockDelegate', true);

        this.blocksUpdateObservable = new Subject<void>();
        (<any>window).blockDel = this;
    }

    /**
     * Check if blocks are disabled in a certain site.
     *
     * @param site Site. If not defined, use current site.
     * @return Whether it's disabled.
     */
    areBlocksDisabledInSite(site?: CoreSite): boolean {
        site = site || CoreSites.getCurrentSite();

        return !!site && site.isFeatureDisabled('NoDelegate_SiteBlocks');
    }

    /**
     * Check if blocks are disabled in a certain site for courses.
     *
     * @param site Site. If not defined, use current site.
     * @return Whether it's disabled.
     */
    areBlocksDisabledInCourses(site?: CoreSite): boolean {
        site = site || CoreSites.getCurrentSite();

        return !!site && site.isFeatureDisabled('NoDelegate_CourseBlocks');
    }

    /**
     * Check if blocks are disabled in a certain site.
     *
     * @param siteId Site Id. If not defined, use current site.
     * @return Promise resolved with true if disabled, rejected or resolved with false otherwise.
     */
    async areBlocksDisabled(siteId?: string): Promise<boolean> {
        const site = await CoreSites.getSite(siteId);

        return this.areBlocksDisabledInSite(site);
    }

    /**
     * Get the display data for a certain block.
     *
     * @param block The block to render.
     * @param contextLevel The context where the block will be used.
     * @param instanceId The instance ID associated with the context level.
     * @return Promise resolved with the display data.
     */
    async getBlockDisplayData(
        block: CoreCourseBlock,
        contextLevel: string,
        instanceId: number,
    ): Promise<CoreBlockHandlerData | undefined> {
        return this.executeFunctionOnEnabled(
            block.name,
            'getDisplayData',
            [block, contextLevel, instanceId],
        );
    }

    /**
     * Check if any of the blocks in a list is supported.
     *
     * @param blocks The list of blocks.
     * @return Whether any of the blocks is supported.
     */
    hasSupportedBlock(blocks: CoreCourseBlock[]): boolean {
        blocks = blocks || [];

        return !!blocks.find((block) => this.isBlockSupported(block.name));
    }

    /**
     * Check if a block is supported.
     *
     * @param name Block "name". E.g. 'activity_modules'.
     * @return Whether it's supported.
     */
    isBlockSupported(name: string): boolean {
        return this.hasHandler(name, true);
    }

    /**
     * Check if feature is enabled or disabled in the site, depending on the feature prefix and the handler name.
     *
     * @param handler Handler to check.
     * @param site Site to check.
     * @return Whether is enabled or disabled in site.
     */
    protected isFeatureDisabled(handler: CoreBlockHandler, site: CoreSite): boolean {
        return this.areBlocksDisabledInSite(site) || super.isFeatureDisabled(handler, site);
    }

    /**
     * Called when there are new block handlers available. Informs anyone who subscribed to the
     * observable.
     */
    updateData(): void {
        this.blocksUpdateObservable.next();
    }

    /**
     * Compare 2 blocks data to check if there are meaningful changes that affect the UI.
     *
     * @param blockA First block.
     * @param blockB Second block.
     * @param contextLevel The context where the block will be used.
     * @param instanceId The instance ID associated with the context level.
     * @return Whether there are meaningful changes.
     */
    async blockHasMeaningfulChanges(
        blockA: CoreCourseBlock,
        blockB: CoreCourseBlock,
        contextLevel: string,
        instanceId: number,
    ): Promise<boolean> {
        if (blockA.name !== blockB.name) {
            return true;
        }

        const handler = this.getHandler(blockA.name, true);
        if (!handler) {
            return false;
        }

        if (handler.blockHasMeaningfulChanges) {
            return await handler.blockHasMeaningfulChanges(blockA, blockB);
        } else if (!handler.getDisplayData) {
            return false;
        }

        // Check its component to see if changes can be determined automatically.
        const [displayDataA, displayDataB] = await Promise.all([
            handler.getDisplayData(blockA, contextLevel, instanceId),
            handler.getDisplayData(blockB, contextLevel, instanceId),
        ]);

        if (!displayDataA) {
            return !!displayDataB;
        } else if (!displayDataB) {
            return !!displayDataA;
        }

        if (CoreUtils.isSubclassOrEqual(displayDataA.component, CoreBlockOnlyTitleComponent)) {
            return displayDataA.title !== displayDataB.title || displayDataA.link !== displayDataB.link ||
                !CoreObject.deepEquals(displayDataA.linkParams, displayDataB.linkParams);
        } else if (CoreUtils.isSubclassOrEqual(displayDataB.component, CoreBlockPreRenderedComponent)) {
            return displayDataA.title !== displayDataB.title || blockA.contents?.content !== blockB.contents?.content ||
                blockA.contents?.footer !== blockB.contents?.footer;
        }
        console.error('IS OTHER BLOCK', blockA.name);

        return false;
    }

}

export const CoreBlockDelegate = makeSingleton(CoreBlockDelegateService);
