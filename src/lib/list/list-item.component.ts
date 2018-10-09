import { Component, ViewEncapsulation, ChangeDetectionStrategy, Input, Directive } from '@angular/core';
import { coerceBooleanProperty } from '../utils';

@Directive({
  selector: '[apto-list-item-icon], [aptoListItemIcon]',
  host: {'class': 'AptoListItem-icon'}
})
export class AptoListItemIconDirective {}

@Component({
    selector: 'apto-list-item',
    templateUrl: 'list-item.html',
    styleUrls: ['./list-item.scss'],
    host: {
        'class': 'AptoListItem',
        '[class.AptoListItem--link]': 'link',
        '[class.AptoListItem--empty]': 'empty'
    },
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AptoListItemComponent {
    @Input()
        get link(): boolean {
            return this._link;
        }
        set link(link: boolean) {
            this._link = coerceBooleanProperty(link);
        }
    @Input()
        get empty(): boolean {
            return this._empty;
        }
        set empty(empty: boolean) {
            this._empty = coerceBooleanProperty(empty);
        }

    private _link = false;
    private _empty = false;
}
