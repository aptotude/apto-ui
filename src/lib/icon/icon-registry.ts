/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  Inject,
  Injectable,
  InjectionToken,
  Optional,
  SecurityContext,
  SkipSelf
} from '@angular/core';
import {
  DomSanitizer,
  SafeResourceUrl,
  SafeHtml
} from '@angular/platform-browser';
import { Observable } from 'rxjs/Observable';
import { forkJoin } from 'rxjs/observable/forkJoin';
import { of as observableOf } from 'rxjs/observable/of';
import { _throw as observableThrow } from 'rxjs/observable/throw';
import { catchError } from 'rxjs/operators/catchError';
import { tap } from 'rxjs/operators/tap';
import { finalize } from 'rxjs/operators/finalize';
import { map } from 'rxjs/operators/map';
import { share } from 'rxjs/operators/share';

/**
 * Returns an exception to be thrown in the case when attempting to
 * load an icon with a name that cannot be found.
 */
export function getAptoIconNameNotFoundError(iconName: string): Error {
    return Error(`Unable to find icon with the name "${iconName}"`);
}

/**
 * Returns an exception to be thrown when the consumer attempts to use
 * `<apto-icon>` without including @angular/http.
 */
export function getAptoIconNoHttpProviderError(): Error {
    return Error(
        `Could not find HttpClient provider for use with Apto Icons. ` +
        `Please include the HttpClientModule from @angular/common/http in your ` +
        `app imports.`
    );
}

/**
 * Returns an exception to be thrown when a URL couldn't be sanitized.
 * @param url URL that was attempted to be sanitized.
 */
export function getAptoIconFailedToSanitizeUrlError(
  url: SafeResourceUrl
): Error {
    return Error(
        `The URL provided to AptoIconRegistry was not trusted as a resource URL ` +
        `via Angular's DomSanitizer. Attempted URL was ${url}.`
    );
}

/**
 * Returns an exception to be thrown when a HTML string couldn't be sanitized.
 * @param literal HTML that was attempted to be sanitized.
 */
export function getAptoIconFailedToSanitizeLiteralError(literal: SafeHtml): Error {
    return Error(
        `The literal provided to AptoIconRegistry was not trusted as safe HTML by ` +
        `Angular's DomSanitizer. Attempted literal was ${literal}.`
    );
}

/**
 * Configuration for an icon, including the URL and possibly the cached SVG element.
 */
class SvgIconConfig {
    url: SafeResourceUrl | null;
    svgElement: SVGElement | null;

    constructor(data: SafeResourceUrl | SVGElement) {
    // Note that we can't use `instanceof SVGElement` here,
    // because it'll break during server-side rendering.
    if (!!(data as any).nodeName) {
        this.svgElement = data as SVGElement;
    } else {
        this.url = data as SafeResourceUrl;
    }
    }
}

/**
 * Service to register and display icons used by the `<apto-icon>` component.
 * - Registers icon URLs by namespace and name.
 * - Registers icon set URLs by namespace.
 * - Loads icons from URLs and extracts individual icons from icon sets.
 */
@Injectable()
export class AptoIconRegistry {
    private _document: Document;

    /**
     * URLs and cached SVG elements for individual icons. Keys are of the format "[namespace]:[icon]".
     */
    private _svgIconConfigs = new Map<string, SvgIconConfig>();

    /**
     * SvgIconConfig objects and cached SVG elements for icon sets, keyed by namespace.
     * Multiple icon sets can be registered under the same namespace.
     */
    private _iconSetConfigs = new Map<string, SvgIconConfig[]>();

    /** Cache for icons loaded by direct URLs. */
    private _cachedIconsByUrl = new Map<string, SVGElement>();

    /** In-progress icon fetches. Used to coalesce multiple requests to the same URL. */
    private _inProgressUrlFetches = new Map<string, Observable<string>>();

    constructor(
        @Optional() private _httpClient: HttpClient,
        private _sanitizer: DomSanitizer,
        @Optional()
        @Inject(DOCUMENT)
        document: any
    ) {
        this._document = document;
    }

    /**
     * Registers an icon by URL in the default namespace.
     * @param iconName Name under which the icon should be registered.
     * @param url
     */
    public addSvgIcon(iconName: string, url: SafeResourceUrl): this {
        return this.addSvgIconInNamespace('', iconName, url);
    }

    /**
     * Registers an icon by URL in the specified namespace.
     * @param namespace Namespace in which the icon should be registered.
     * @param iconName Name under which the icon should be registered.
     * @param url
     */
    public addSvgIconInNamespace(
        namespace: string,
        iconName: string,
        url: SafeResourceUrl
    ): this {
        return this._addSvgIconConfig(namespace, iconName, new SvgIconConfig(url));
    }

    /**
     * Registers an icon set by URL in the default namespace.
     * @param url
     */
    public addSvgIconSet(url: SafeResourceUrl): this {
        return this.addSvgIconSetInNamespace('', url);
    }

    /**
     * Registers an icon set by URL in the specified namespace.
     * @param namespace Namespace in which to register the icon set.
     * @param url
     */
    public addSvgIconSetInNamespace(namespace: string, url: SafeResourceUrl): this {
        return this._addSvgIconSetConfig(namespace, new SvgIconConfig(url));
    }

    /**
     * Returns an Observable that produces the icon (as an `<svg>` DOM element) from the given URL.
     * The response from the URL may be cached so this will not always cause an HTTP request, but
     * the produced element will always be a new copy of the originally fetched icon. (That is,
     * it will not contain any modifications made to elements previously returned).
     *
     * @param safeUrl URL from which to fetch the SVG icon.
     */
    public getSvgIconFromUrl(safeUrl: SafeResourceUrl): Observable<SVGElement> {
        const url = this._sanitizer.sanitize(SecurityContext.RESOURCE_URL, safeUrl);

        if (!url) {
            throw getAptoIconFailedToSanitizeUrlError(safeUrl);
        }

        const cachedIcon = this._cachedIconsByUrl.get(url);

        if (cachedIcon) {
            return observableOf(cloneSvg(cachedIcon));
        }

        return this._loadSvgIconFromConfig(new SvgIconConfig(safeUrl)).pipe(
            tap(svg => this._cachedIconsByUrl.set(url!, svg)), // tslint:disable-line
            map(svg => cloneSvg(svg))
        );
    }

    /**
     * Returns an Observable that produces the icon (as an `<svg>` DOM element) with the given name
     * and namespace. The icon must have been previously registered with addIcon or addIconSet;
     * if not, the Observable will throw an error.
     *
     * @param name Name of the icon to be retrieved.
     * @param namespace Namespace in which to look for the icon.
     */
    public getNamedSvgIcon(
        name: string,
        namespace: string = ''
    ): Observable<SVGElement> {
        // Return (copy of) cached icon if possible.
        const key = iconKey(namespace, name);
        const config = this._svgIconConfigs.get(key);

        if (config) {
            return this._getSvgFromConfig(config);
        }

        // See if we have any icon sets registered for the namespace.
        const iconSetConfigs = this._iconSetConfigs.get(namespace);

        if (iconSetConfigs) {
            return this._getSvgFromIconSetConfigs(name, iconSetConfigs);
        }

        return observableThrow(getAptoIconNameNotFoundError(key));
    }

    /**
     * Returns the cached icon for a SvgIconConfig if available, or fetches it from its URL if not.
     */
    private _getSvgFromConfig(config: SvgIconConfig): Observable<SVGElement> {
        if (config.svgElement) {
            // We already have the SVG element for this icon, return a copy.
            return observableOf(cloneSvg(config.svgElement));
        } else {
            // Fetch the icon from the config's URL, cache it, and return a copy.
            return this._loadSvgIconFromConfig(config).pipe(
                tap(svg => (config.svgElement = svg)),
                map(svg => cloneSvg(svg))
            );
        }
    }

    /**
     * Attempts to find an icon with the specified name in any of the SVG icon sets.
     * First searches the available cached icons for a nested element with a matching name, and
     * if found copies the element to a new `<svg>` element. If not found, fetches all icon sets
     * that have not been cached, and searches again after all fetches are completed.
     * The returned Observable produces the SVG element if possible, and throws
     * an error if no icon with the specified name can be found.
     */
    private _getSvgFromIconSetConfigs(
        name: string,
        iconSetConfigs: SvgIconConfig[]
    ): Observable<SVGElement> {
        // For all the icon set SVG elements we've fetched, see if any contain an icon with the
        // requested name.
        const namedIcon = this._extractIconWithNameFromAnySet(name, iconSetConfigs);

        if (namedIcon) {
            // We could cache namedIcon in _svgIconConfigs, but since we have to make a copy every
            // time anyway, there's probably not much advantage compared to just always extracting
            // it from the icon set.
            return observableOf(namedIcon);
        }

        // Not found in any cached icon sets. If there are icon sets with URLs that we haven't
        // fetched, fetch them now and look for iconName in the results.
        const iconSetFetchRequests: Observable<SVGElement | null>[] = iconSetConfigs
            .filter(iconSetConfig => !iconSetConfig.svgElement)
            .map(iconSetConfig => {
                return this._loadSvgIconSetFromConfig(iconSetConfig).pipe(
                    catchError(
                        (err: HttpErrorResponse): Observable<SVGElement | null> => {
                            const url = this._sanitizer.sanitize(
                                SecurityContext.RESOURCE_URL,
                                iconSetConfig.url
                            );

                            // Swallow errors fetching individual URLs so the
                            // combined Observable won't necessarily fail.
                            console.error(
                                `Loading icon set URL: ${url} failed: ${err.message}`
                            );
                            return observableOf(null);
                        }
                    )
                );
            });

        // Fetch all the icon set URLs. When the requests complete, every IconSet should have a
        // cached SVG element (unless the request failed), and we can check again for the icon.
        return forkJoin(iconSetFetchRequests).pipe(
            map(() => {
                const foundIcon = this._extractIconWithNameFromAnySet(
                name,
                iconSetConfigs
                );

                if (!foundIcon) {
                    throw getAptoIconNameNotFoundError(name);
                }

                return foundIcon;
            })
        );
    }

    /**
     * Searches the cached SVG elements for the given icon sets for a nested icon element whose "id"
     * tag matches the specified name. If found, copies the nested element to a new SVG element and
     * returns it. Returns null if no matching element is found.
     */
    private _extractIconWithNameFromAnySet(
        iconName: string,
        iconSetConfigs: SvgIconConfig[]
    ): SVGElement | null {
        // Iterate backwards, so icon sets added later have precedence.
        for (let i = iconSetConfigs.length - 1; i >= 0; i--) {
            const config = iconSetConfigs[i];
            if (config.svgElement) {
                const foundIcon = this._extractSvgIconFromSet(
                config.svgElement,
                iconName
                );
                if (foundIcon) {
                    return foundIcon;
                }
            }
        }
        return null;
    }

    /**
     * Loads the content of the icon URL specified in the SvgIconConfig and creates an SVG element
     * from it.
     */
    private _loadSvgIconFromConfig(
        config: SvgIconConfig
    ): Observable<SVGElement> {
        return this._fetchUrl(config.url).pipe(
            map(svgText => this._createSvgElementForSingleIcon(svgText))
        );
    }

    /**
     * Loads the content of the icon set URL specified in the SvgIconConfig and creates an SVG element
     * from it.
     */
    private _loadSvgIconSetFromConfig(
        config: SvgIconConfig
    ): Observable<SVGElement> {
        // If the SVG for this icon set has already been parsed, do nothing.
        if (config.svgElement) {
            return observableOf(config.svgElement);
        }

        return this._fetchUrl(config.url).pipe(
            map(svgText => {
                // It is possible that the icon set was parsed and cached by an earlier request, so parsing
                // only needs to occur if the cache is yet unset.
                if (!config.svgElement) {
                config.svgElement = this._svgElementFromString(svgText);
                }

                return config.svgElement;
            })
        );
    }

    /**
     * Creates a DOM element from the given SVG string, and adds default attributes.
     */
    private _createSvgElementForSingleIcon(responseText: string): SVGElement {
        const svg = this._svgElementFromString(responseText);
        this._setSvgAttributes(svg);
        return svg;
    }

    /**
     * Searches the cached element of the given SvgIconConfig for a nested icon element whose "id"
     * tag matches the specified name. If found, copies the nested element to a new SVG element and
     * returns it. Returns null if no matching element is found.
     */
    private _extractSvgIconFromSet(
        iconSet: SVGElement,
        iconName: string
    ): SVGElement | null {
        const iconSource = iconSet.querySelector(`#${iconName}`);

        if (!iconSource) {
            return null;
        }

        // Clone the element and remove the ID to prevent multiple elements from being added
        // to the page with the same ID.
        const iconElement = iconSource.cloneNode(true) as Element;
        iconElement.removeAttribute('id');

        // If the icon node is itself an <svg> node, clone and return it directly. If not, set it as
        // the content of a new <svg> node.
        if (iconElement.nodeName.toLowerCase() === 'svg') {
            return this._setSvgAttributes(iconElement as SVGElement);
        }

        // If the node is a <symbol>, it won't be rendered so we have to convert it into <svg>. Note
        // that the same could be achieved by referring to it via <use href="#id">, however the <use>
        // tag is problematic on Firefox, because it needs to include the current page path.
        if (iconElement.nodeName.toLowerCase() === 'symbol') {
            return this._setSvgAttributes(this._toSvgElement(iconElement));
        }

        // createElement('SVG') doesn't work as expected; the DOM ends up with
        // the correct nodes, but the SVG content doesn't render. Instead we
        // have to create an empty SVG node using innerHTML and append its content.
        // Elements created using DOMParser.parseFromString have the same problem.
        // http://stackoverflow.com/questions/23003278/svg-innerhtml-in-firefox-can-not-display
        const svg = this._svgElementFromString('<svg></svg>');
        // Clone the node so we don't remove it from the parent icon set element.
        svg.appendChild(iconElement);

        return this._setSvgAttributes(svg);
    }

    /**
     * Creates a DOM element from the given SVG string.
     */
    private _svgElementFromString(str: string): SVGElement {
        const div = this._document.createElement('DIV');
        div.innerHTML = str;
        const svg = div.querySelector('svg') as SVGElement;

        if (!svg) {
            throw Error('<svg> tag not found');
        }

        return svg;
    }

    /**
     * Converts an element into an SVG node by cloning all of its children.
     */
    private _toSvgElement(element: Element): SVGElement {
        const svg = this._svgElementFromString('<svg></svg>');

        for (let i = 0; i < element.childNodes.length; i++) {
            if (element.childNodes[i].nodeType === this._document.ELEMENT_NODE) {
                svg.appendChild(element.childNodes[i].cloneNode(true));
            }
        }

        return svg;
    }

    /**
     * Sets the default attributes for an SVG element to be used as an icon.
     */
    private _setSvgAttributes(svg: SVGElement): SVGElement {
        svg.setAttribute('fit', '');
        svg.setAttribute('height', '100%');
        svg.setAttribute('width', '100%');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.removeAttribute('y');
        svg.removeAttribute('x');
        svg.setAttribute('focusable', 'false');
        return svg;
    }

    /**
     * Returns an Observable which produces the string contents of the given URL. Results may be
     * cached, so future calls with the same URL may not cause another HTTP request.
     */
    private _fetchUrl(safeUrl: SafeResourceUrl | null): Observable<string> {
        if (!this._httpClient) {
            throw getAptoIconNoHttpProviderError();
        }

        if (safeUrl == null) {
            throw Error(`Cannot fetch icon from URL "${safeUrl}".`);
        }

        const url = this._sanitizer.sanitize(SecurityContext.RESOURCE_URL, safeUrl);

        if (!url) {
            throw getAptoIconFailedToSanitizeUrlError(safeUrl);
        }

        // Store in-progress fetches to avoid sending a duplicate request for a URL when there is
        // already a request in progress for that URL. It's necessary to call share() on the
        // Observable returned by http.get() so that multiple subscribers don't cause multiple XHRs.
        const inProgressFetch = this._inProgressUrlFetches.get(url);

        if (inProgressFetch) {
            return inProgressFetch;
        }

        // TODO(jelbourn): for some reason, the `finalize` operator "loses" the generic type on the
        // Observable. Figure out why and fix it.
        const req = this._httpClient.get(url, { responseType: 'text' }).pipe(
            finalize(() => this._inProgressUrlFetches.delete(url)),
            share()
        );

        this._inProgressUrlFetches.set(url, req);
        return req;
    }

    /**
     * Registers an icon config by name in the specified namespace.
     * @param namespace Namespace in which to register the icon config.
     * @param iconName Name under which to register the config.
     * @param config Config to be registered.
     */
    private _addSvgIconConfig(
        namespace: string,
        iconName: string,
        config: SvgIconConfig
    ): this {
        this._svgIconConfigs.set(iconKey(namespace, iconName), config);
        return this;
    }

    /**
     * Registers an icon set config in the specified namespace.
     * @param namespace Namespace in which to register the icon config.
     * @param config Config to be registered.
     */
    private _addSvgIconSetConfig(namespace: string, config: SvgIconConfig): this {
        const configNamespace = this._iconSetConfigs.get(namespace);

        if (configNamespace) {
            configNamespace.push(config);
        } else {
            this._iconSetConfigs.set(namespace, [config]);
        }

        return this;
    }
}

export function ICON_REGISTRY_PROVIDER_FACTORY(
    parentRegistry: AptoIconRegistry,
    httpClient: HttpClient,
    sanitizer: DomSanitizer,
    document?: any
) {
    return parentRegistry || new AptoIconRegistry(httpClient, sanitizer, document);
}

export const ICON_REGISTRY_PROVIDER = {
    // If there is already an AptoIconRegistry available, use that. Otherwise, provide a new one.
    provide: AptoIconRegistry,
    deps: [
        [new Optional(), new SkipSelf(), AptoIconRegistry],
        [new Optional(), HttpClient],
        DomSanitizer,
        [new Optional(), DOCUMENT as InjectionToken<any>]
    ],
    useFactory: ICON_REGISTRY_PROVIDER_FACTORY
};

/** Clones an SVGElement while preserving type information. */
function cloneSvg(svg: SVGElement): SVGElement {
    return svg.cloneNode(true) as SVGElement;
}

/** Returns the cache key to use for an icon namespace and name. */
function iconKey(namespace: string, name: string) {
    return `${namespace}:${name}`;
}
