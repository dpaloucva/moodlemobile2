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

import { Injectable } from '@angular/core';
import { CoreCourse, CoreCourseBlock } from '@features/course/services/course';
import { CoreBlockDelegate } from './block-delegate';
import { makeSingleton } from '@singletons';
import { of } from 'rxjs';
import { firstValueFrom } from '@/core/utils/rxjs';
import { CoreSitesCommonWSOptions } from '@services/sites';
import { catchError, map } from 'rxjs/operators';
import { WSObservable } from '@classes/site';

/**
 * Service that provides helper functions for blocks.
 */
@Injectable({ providedIn: 'root' })
export class CoreBlockHelperProvider {

    /**
     * Return if it get course blocks options is enabled for the current site.
     *
     * @return true if enabled, false otherwise.
     */
    canGetCourseBlocks(): boolean {
        return CoreCourse.canGetCourseBlocks() && !CoreBlockDelegate.areBlocksDisabledInCourses();
    }

    /**
     * Returns the list of blocks for the selected course. It will return an empty list if there are no supported blocks.
     *
     * @param courseId Course ID.
     * @param options Other options.
     * @return List of blocks.
     */
    getCourseBlocks(courseId: number, options: CoreSitesCommonWSOptions = {}): Promise<CoreCourseBlock[]> {
        return firstValueFrom(this.getCourseBlocksObservable(courseId, options));
    }

    /**
     * Returns the list of blocks for the selected course. It will return an empty list if there are no supported blocks.
     *
     * @param courseId Course ID.
     * @param options Other options.
     * @return List of blocks.
     */
    getCourseBlocksObservable(courseId: number, options: CoreSitesCommonWSOptions = {}): WSObservable<CoreCourseBlock[]> {
        const canGetBlocks = this.canGetCourseBlocks();

        if (!canGetBlocks) {
            return of([]);
        }

        return CoreCourse.getCourseBlocksObservable(courseId, options).pipe(map(blocks =>
            CoreBlockDelegate.hasSupportedBlock(blocks) ? blocks : []));
    }

    /**
     * Returns if the course has any supported block.
     *
     * @param courseId Course ID.
     * @param options Other options.
     * @return Wether course has blocks.
     */
    async hasCourseBlocks(courseId: number, options: CoreSitesCommonWSOptions = {}): Promise<boolean> {
        return firstValueFrom(this.hasCourseBlocksObservable(courseId, options));
    }

    /**
     * Returns if the course has any supported block.
     *
     * @param courseId Course ID.
     * @param options Other options.
     * @return Wether course has blocks.
     */
    hasCourseBlocksObservable(courseId: number, options: CoreSitesCommonWSOptions = {}): WSObservable<boolean> {
        return this.getCourseBlocksObservable(courseId, options).pipe(
            map(blocks => blocks.length > 0),
            catchError(() => of(false)),
        );
    }

}

export const CoreBlockHelper = makeSingleton(CoreBlockHelperProvider);
