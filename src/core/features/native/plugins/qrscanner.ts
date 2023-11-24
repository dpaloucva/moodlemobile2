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
import { BehaviorSubject, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { QRScannerStatus } from '@moodlehq/cordova-plugin-qrscanner';

/**
 * QR Scanner plugin wrapper
 */
@Injectable({ providedIn: 'root' })
export class QRScanner {

    private window: Window;

    constructor() {
        this.window = window;
    }

    /**
     * Destroy QR scanner instance.
     *
     * @returns null
     */
    destroy(): Promise<null> {
        return new Promise((resolve) => this.window.QRScanner.destroy(resolve));
    }

    /**
     * Prepare QR scanner instance.
     *
     * @returns qr scanner status.
     */
    prepare(): Promise<QRScannerStatus> {
        return new Promise(resolve =>
            this.window.QRScanner.prepare((foo: unknown, status: QRScannerStatus) => (resolve(status))));
    }

    /**
     * Show QR Scanner.
     *
     * @returns Qr scanner status.
     */
    show(): Promise<QRScannerStatus> {
        return new Promise(resolve => this.window.QRScanner.show((status: QRScannerStatus) => resolve(status)));
    }

    /**
     * Return QR content scanned.
     *
     * @returns Content scanned.
     */
    scan(): Observable<string> {
        const subject = new BehaviorSubject<string>('');
        this.window.QRScanner.scan((foo: unknown, text: string) => subject.next(text));

        return subject.asObservable().pipe(filter(text => !!text));
    }

    /**
     * Hide QR Scanner.
     *
     * @returns null.
     */
    hide(): Promise<null> {
        return new Promise((resolve) => this.window.QRScanner.hide(resolve));
    }

}
