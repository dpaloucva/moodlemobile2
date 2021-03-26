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

import { CoreTextUtils } from '@services/utils/text';
import { CoreFile } from '@services/file';
import { CoreUtils, PromiseDefer } from '@services/utils/utils';
import { NativeHttp } from '@singletons';
import { CoreApp } from '@services/app';

/**
 * Singleton to create FileTransfer instances, similar to how Cordova FileTransfer worked.
 */
export class FileTransfer {

    /**
     * Creates a new FileTransferObjectMock object.
     */
    static create(): FileTransferObject {
        return new FileTransferObject();
    }

}

/**
 * Class to downlaod or upload files.
 */
export class FileTransferObject {

    progressListener?: (event: ProgressEvent) => void;
    source?: string;
    target?: string;

    protected request?: XMLHttpRequest;
    protected deferred?: PromiseDefer<FileEntry | FileUploadResult>;

    /**
     * Aborts an in-progress transfer. The onerror callback is passed a FileTransferError
     * object which has an error code of FileTransferError.ABORT_ERR.
     */
    abort(): void {
        // The HTTP plugin has an abort method, but it requires the requestId and the ionic-native plugin doesn't return it.
        this.request?.abort();
        this.deferred?.reject(new FileTransferError(FileTransferError.ABORT_ERR, this.source!, this.target!, 0, '', ''));
    }

    /**
     * Downloads a file from server.
     *
     * @param source URL of the server to download the file, as encoded by encodeURI().
     * @param target Filesystem url representing the file on the device.
     * @param options Optional parameters.
     * @return Returns a Promise that resolves to a FileEntry object.
     */
    download(source: string, target: string, options?: FileTransferDownloadOptions): Promise<FileEntry> {
        this.deferred = CoreUtils.promiseDefer<FileEntry>();
        this.source = source;
        this.target = target;

        // Use XMLHttpRequest instead of HttpClient to support onprogress and abort.
        const basicAuthHeader = this.getBasicAuthHeader(source);

        if (basicAuthHeader) {
            source = source.replace(this.getUrlCredentials(source) + '@', '');

            options = options || {};
            options.headers = options.headers || {};
            options.headers[basicAuthHeader.name] = basicAuthHeader.value;
        }

        if (CoreApp.isMobile()) {
            // Use Native HTTP library to avoid CORS errors.
            this.downloadUsingNative(source, target, options);
        } else {
            this.downloadUsingXHR(source, target, options);
        }

        return <Promise<FileEntry>> this.deferred.promise;
    }

    /**
     * Downloads a file from server using native HTTP library to avoid CORS errors.
     *
     * @param source URL of the server to download the file, as encoded by encodeURI().
     * @param target Filesystem url representing the file on the device.
     * @param options Optional parameters.
     */
    protected downloadUsingNative(source: string, target: string, options?: FileTransferDownloadOptions): void {
        // eslint-disable-next-line promise/catch-or-return
        NativeHttp.downloadFile(source, {}, options?.headers, target).then(this.deferred!.resolve, (error) => {
            if (!error || error.status < 300 || error.status >= 400) {
                throw error;
            }

            // It's a redirect, there's a bug in the plugin that makes it fail in Android. Check if we can get the final URL.
            const redirectUrl = error.headers?.location;
            if (!redirectUrl || redirectUrl == source) {
                throw error;
            }

            // Try again with the new URL.
            this.downloadUsingNative(redirectUrl, target, options);
        });
    }

    /**
     * Downloads a file from server using XMLHttpRequest.
     *
     * @param source URL of the server to download the file, as encoded by encodeURI().
     * @param target Filesystem url representing the file on the device.
     * @param options Optional parameters.
     */
    protected downloadUsingXHR(source: string, target: string, options?: FileTransferDownloadOptions): void {
        const xhr = new XMLHttpRequest();
        const headers = options?.headers || null;
        this.request = xhr;

        // Prepare the request.
        xhr.open('GET', source, true);
        xhr.responseType = 'blob';
        for (const name in headers) {
            xhr.setRequestHeader(name, headers[name]);
        }

        xhr.onprogress = (ev: ProgressEvent): void => {
            if (this.progressListener) {
                this.progressListener(ev);
            }
        };

        xhr.onerror = (): void => {
            this.deferred!.reject(new FileTransferError(-1, source, target, xhr.status, xhr.statusText, ''));
        };

        xhr.onload = async (): Promise<void> => {
            // Finished dowloading the file.
            let response = xhr.response || xhr.responseText;

            const status = Math.max(xhr.status === 1223 ? 204 : xhr.status, 0);
            if (status < 200 || status >= 300) {
                // Request failed. Try to get the error message.
                response = await this.parseResponse(response);

                this.deferred!.reject(new FileTransferError(-1, source, target, xhr.status, response || xhr.statusText, ''));

                return;
            }

            if (!response) {
                this.deferred!.reject();

                return;
            }

            const basePath = CoreFile.getBasePathInstant();
            target = target.replace(basePath, ''); // Remove basePath from the target.
            target = target.replace(/%20/g, ' '); // Replace all %20 with spaces.

            // eslint-disable-next-line promise/catch-or-return
            CoreFile.writeFile(target, response).then(this.deferred!.resolve, this.deferred!.reject);
        };

        xhr.send();
    }

    /**
     * Given a URL, check if it has a credentials in it and, if so, return them in a header object.
     * This code is extracted from Cordova FileTransfer plugin.
     *
     * @param urlString The URL to get the credentials from.
     * @return The header with the credentials, null if no credentials.
     */
    protected getBasicAuthHeader(urlString: string): {name: string; value: string} | null {
        let header: {name: string; value: string} | null = null;

        // MS Windows doesn't support credentials in http uris so we detect them by regexp and strip off from result url.
        if (window.btoa) {
            const credentials = this.getUrlCredentials(urlString);
            if (credentials) {
                header = {
                    name: 'Authorization',
                    value: 'Basic ' + window.btoa(credentials),
                };
            }
        }

        return header;
    }

    /**
     * Given an instance of XMLHttpRequest, get the response headers as an object.
     *
     * @param xhr XMLHttpRequest instance.
     * @return Object with the headers.
     */
    protected getHeadersAsObject(xhr: XMLHttpRequest): Record<string, string> {
        const headersString = xhr.getAllResponseHeaders();
        const result = {};

        if (headersString) {
            const headers = headersString.split('\n');
            for (const i in headers) {
                const headerString = headers[i];
                const separatorPos = headerString.indexOf(':');
                if (separatorPos != -1) {
                    result[headerString.substr(0, separatorPos)] = headerString.substr(separatorPos + 1).trim();
                }
            }
        }

        return result;
    }

    /**
     * Get the credentials from a URL.
     * This code is extracted from Cordova FileTransfer plugin.
     *
     * @param urlString The URL to get the credentials from.
     * @return Retrieved credentials.
     */
    protected getUrlCredentials(urlString: string): string | null {
        const credentialsPattern = /^https?:\/\/(?:(?:(([^:@/]*)(?::([^@/]*))?)?@)?([^:/?#]*)(?::(\d*))?).*$/;
        const credentials = credentialsPattern.exec(urlString);

        return credentials && credentials[1];
    }

    /**
     * Registers a listener that gets called whenever a new chunk of data is transferred.
     *
     * @param listener Listener that takes a progress event.
     */
    onProgress(listener: (event: ProgressEvent) => void): void {
        this.progressListener = listener;
    }

    /**
     * Parse a response, converting it into text and the into an object if needed.
     *
     * @param response The response to parse.
     * @return Promise resolved with the parsed response.
     */
    protected async parseResponse(response: Blob | ArrayBuffer | string | null): Promise<unknown> {
        if (!response) {
            return '';

        }

        let responseText = '';

        if (response instanceof Blob) {
            responseText = await this.blobToText(response);

        } else if (response instanceof ArrayBuffer) {
            // Convert the ArrayBuffer into text.
            responseText = String.fromCharCode.apply(null, new Uint8Array(response));

        } else {
            responseText = response;
        }

        return CoreTextUtils.parseJSON(responseText, '');
    }

    /**
     * Convert a Blob to text.
     *
     * @param blob Blob to convert.
     * @return Promise resolved with blob contents.
     */
    protected blobToText(blob: Blob): Promise<string> {
        return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = (): void => {
                resolve(<string> reader.result);
            };
            reader.readAsText(blob);
        });
    }

    /**
     * Sends a file to a server.
     *
     * @param fileUrl Filesystem URL representing the file on the device or a data URI.
     * @param url URL of the server to receive the file, as encoded by encodeURI().
     * @param options Optional parameters.
     * @return Promise that resolves to a FileUploadResult and rejects with FileTransferError.
     */
    upload(fileUrl: string, url: string, options?: FileUploadOptions): Promise<FileUploadResult> {
        this.deferred = CoreUtils.promiseDefer<FileUploadResult>();
        options = options || {};

        const basicAuthHeader = this.getBasicAuthHeader(url);

        if (basicAuthHeader) {
            url = url.replace(this.getUrlCredentials(url) + '@', '');

            options.headers = options.headers || {};
            options.headers[basicAuthHeader.name] = basicAuthHeader.value;
        }

        if (!options.fileName) {
            options.fileName = CoreFile.getFileAndDirectoryFromPath(fileUrl).name;
        }

        options.httpMethod = options.httpMethod?.toUpperCase() == 'PUT' ? 'PUT' : 'POST';

        if (CoreApp.isMobile()) {
            // Use Native HTTP library to avoid CORS errors.
            // eslint-disable-next-line promise/catch-or-return
            NativeHttp.uploadFile(url, options.params || {}, options.headers, fileUrl, options.fileName)
                .then(this.deferred!.resolve, this.deferred.reject);
        } else {
            this.uploadUsingXHR(fileUrl, url, options);
        }

        return <Promise<FileUploadResult>> this.deferred.promise;
    }

    /**
     * Sends a file to a server using XMLHttpRequest.
     *
     * @param fileUrl Filesystem URL representing the file on the device or a data URI.
     * @param url URL of the server to receive the file, as encoded by encodeURI().
     * @param options Optional parameters.
     */
    protected uploadUsingXHR(fileUrl: string, url: string, options: FileUploadOptions): void {
        // Add fileKey and fileName to the headers.
        options.headers = options.headers || {};
        if (!options.headers['Content-Disposition']) {
            options.headers['Content-Disposition'] = 'form-data;' + (options.fileKey ? ' name="' + options.fileKey + '";' : '') +
                ' filename="' + options.fileName + '"';
        }

        // Adding a Content-Type header with the mimeType makes the request fail (it doesn't detect the token in the params).
        // Don't include this header, and delete it if it's supplied.
        delete options.headers['Content-Type'];

        // Get the file to upload.
        CoreFile.getFile(fileUrl).then((fileEntry) => CoreFile.getFileObjectFromFileEntry(fileEntry)).then((file) => {
            // Use XMLHttpRequest instead of HttpClient to support onprogress and abort.
            const xhr = new XMLHttpRequest();
            xhr.open(options.httpMethod!, url);
            for (const name in options.headers) {
                // Filter "unsafe" headers.
                if (name != 'Connection') {
                    xhr.setRequestHeader(name, options.headers[name]);
                }
            }

            xhr.onprogress = (ev: ProgressEvent): void => {
                if (this.progressListener) {
                    this.progressListener(ev);
                }
            };

            this.request = xhr;
            this.source = fileUrl;
            this.target = url;

            xhr.onerror = (): void => {
                this.deferred!.reject(new FileTransferError(-1, fileUrl, url, xhr.status, xhr.statusText, ''));
            };

            xhr.onload = (): void => {
                // Finished uploading the file.
                this.deferred!.resolve({
                    url: url,
                    status: xhr.status,
                    data: xhr.response,
                    headers: this.getHeadersAsObject(xhr),
                });
            };

            // Create a form data to send params and the file.
            const fd = new FormData();
            for (const name in options.params) {
                fd.append(name, options.params[name]);
            }
            fd.append('file', file, options.fileName);

            xhr.send(fd);

            return;
        }).catch(this.deferred!.reject);
    }

}

/**
 * Mock the File Transfer Error.
 */
export class FileTransferError {

    static readonly FILE_NOT_FOUND_ERR = 1;
    static readonly INVALID_URL_ERR = 2;
    static readonly CONNECTION_ERR = 3;
    static readonly ABORT_ERR = 4;
    static readonly NOT_MODIFIED_ERR = 5;

    constructor(
        public code: number,
        public source: string,
        public target: string,
        public http_status: number,
        public body: string,
        public exception: string,
    ) { }

}

export interface FileUploadResult {
    /**
     * URL.
     */
    url: string;
    /**
     * The HTTP response status returned by the server.
     */
    status: number;
    /**
     * The HTTP data returned by the server.
     */
    data: string;
    /**
     * The HTTP response headers by the server.
     */
    headers: Record<string, string>;
}

export interface FileUploadOptions {
    /**
     * The name of the form element.
     * Defaults to 'file'.
     */
    fileKey?: string;

    /**
     * The file name to use when saving the file on the server.
     * Defaults to 'image.jpg'.
     */
    fileName?: string;

    /**
     * The HTTP method to use - either PUT or POST.
     * Defaults to POST.
     */
    httpMethod?: string;

    /**
     * The mime type of the data to upload.
     * Defaults to image/jpeg.
     */
    mimeType?: string;

    /**
     * A set of optional key/value pairs to pass in the HTTP request.
     */
    params?: { [s: string]: string };

    /**
     * Whether to upload the data in chunked streaming mode.
     * Defaults to true.
     */
    chunkedMode?: boolean;

    /**
     * A map of header name/header values. Use an array to specify more
     * than one value. On iOS, FireOS, and Android, if a header named
     * Content-Type is present, multipart form data will NOT be used.
     */
    headers?: { [s: string]: string };
}

/**
 * Download options.
 */
export type FileTransferDownloadOptions = {
    headers?: Record<string, string>;
};
