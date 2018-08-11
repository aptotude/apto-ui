import { async as ngAsync, TestBed, ComponentFixture } from '@angular/core/testing';
import { Component, ViewChild } from '@angular/core';
import { AptoTabsComponentModule } from './tabs.module';
import { AptoTabChangeEvent } from './tab-group/tab-group.component';
import { HOME, END, RIGHT_ARROW, LEFT_ARROW } from '../utils/keycodes';

@Component({
    selector: 'apto-test-app',
    template: `
        <apto-tab-group [selectedIndex]="currTab" data-default #component (selectedTabChange)="changeTabEvent($event)">
            <apto-tab label="One">
                Tab 1 Content
            </apto-tab>
            <apto-tab label="Two">
                Tab 3 Content
            </apto-tab>
            <apto-tab label="Three">
                Tab 3 Content
            </apto-tab>
        </apto-tab-group>
        <apto-tab-group [selectedIndex]="currTab" data-custom>
            <apto-tab>
                <ng-template aptoTabLabel>
                    Custom Label
                </ng-template>
                Tab 1 Content
            </apto-tab>
            <apto-tab label="Two">
                <ng-template aptoTabContent>
                    Tab 3 Custom Content
                </ng-template>
            </apto-tab>
            <apto-tab>
                <ng-template aptoTabLabel>
                    Custom Label 3
                </ng-template>
                <ng-template aptoTabContent>
                    Tab 3 Custom Content
                </ng-template>
            </apto-tab>
        </apto-tab-group>
    `
})
class TestComponent {
    currTab = 0;
    changeIncrement = 0;
    changeHolder: AptoTabChangeEvent;
    @ViewChild('component') public componentRef;
    changeTabEvent(e: AptoTabChangeEvent) {
        this.changeIncrement += 1;
    }
}

describe('apto-tabs', () => {
    let fixture: ComponentFixture<TestComponent>;
    let testComponent: any;
    let groupId: number;
    let defaultTab: any;
    let customTab: any;

    beforeEach(ngAsync(() => {
        TestBed.configureTestingModule({
            imports: [ AptoTabsComponentModule ],
            declarations: [ TestComponent ]
        });
        TestBed.compileComponents();
        fixture = TestBed.createComponent(TestComponent);
        testComponent = fixture.debugElement.componentInstance;
        groupId = testComponent.componentRef.groupId;
        defaultTab = fixture.nativeElement.querySelector('[data-default]');
        customTab = fixture.nativeElement.querySelector('[data-custom]');
        fixture.detectChanges();
    }));

    afterEach(() => {
        fixture.destroy();
    });

    describe('dom structure', () => {
        it('should have nav in a card', () => {
            const nav = defaultTab.querySelector('apto-card apto-card-content nav.apto-tabs-nav');
            expect(nav).not.toEqual(null);
        });

        it('should have 3 nav items', () => {
            const nav = defaultTab.querySelectorAll('.apto-tabs-nav .apto-tabs-nav-item');
            expect(nav.length).toEqual(3);
        });

        it('should have 3 content sections', () => {
            const nav = defaultTab.querySelectorAll('.apto-tabs-content .apto-tabs-pane');
            expect(nav.length).toEqual(3);
        });
    });

    describe('dom injection', () => {
        it('should have label html', () => {
            const nav = defaultTab.querySelector('.apto-tabs-nav-item');
            expect(nav.innerText).toContain('One');
        });

        it('should have content html', () => {
            const pane = defaultTab.querySelector('.apto-tabs-pane');
            expect(pane.innerText).toContain('Tab 1 Content');
        });

        it('should have custom label html using ng-template', () => {
            const nav = customTab.querySelector('.apto-tabs-nav-item');
            expect(nav.innerText).toContain('Custom Label');
        });

        it('should have custom content html using ng-template', async () => {
            testComponent.currTab = 2;
            fixture.detectChanges();

            const pane = customTab.querySelector('.apto-tabs-pane:nth-of-type(3)');
            expect(pane.innerText).toContain('Tab 3 Custom Content');
        });

        it('should have custom content and label html using ng-template', () => {
            testComponent.currTab = 2;
            fixture.detectChanges();

            const pane = customTab.querySelector('.apto-tabs-pane:nth-of-type(3)');
            expect(pane.innerText).toContain('Tab 3 Custom Content');
            const nav = customTab.querySelector('.apto-tabs-nav-item:nth-of-type(3)');
            expect(nav.innerText).toContain('Custom Label 3');
        });
    });

    describe('Set starting active tab', () => {
        it('set second tab as active', () => {
            testComponent.currTab = 1;
            fixture.detectChanges();

            const nav = defaultTab.querySelectorAll('.apto-tabs-nav-item');
            expect(nav[1].className).toContain('apto-tabs-nav-item--active');
        });
    });

    describe('aria', () => {
        it('should have tablist on nav', () => {
            const nav = defaultTab.querySelector('.apto-tabs-nav');
            expect(nav.getAttribute('role')).toEqual('tablist');
        });

        describe('nav item aria', () => {
            let navItem: any;

            beforeEach(() => {
                navItem = defaultTab.querySelector('.apto-tabs-nav-item');
            });

            it('should have role', () => {
                expect(navItem.getAttribute('role')).toEqual('tab');
            });

            it('should have tab index', () => {
                expect(navItem.getAttribute('tabindex')).toEqual('0');
            });

            it('should have aria-selected index', () => {
                expect(navItem.getAttribute('aria-selected')).toEqual('true');
            });

            it('should have aria-controls index', () => {
                expect(navItem.getAttribute('aria-controls')).toEqual(`apto-tab-pane-${groupId}-0`);
            });

            it('should have href index', () => {
                expect(navItem.getAttribute('href')).toEqual(`#apto-tab-pane-${groupId}-0`);
            });

            it('should have id index', () => {
                expect(navItem.getAttribute('id')).toEqual(`apto-tab-nav-${groupId}-0`);
            });

            it('should have aria-setsize index', () => {
                expect(navItem.getAttribute('aria-setsize')).toEqual('3');
            });

            it('should have aria-posinset index', () => {
                expect(navItem.getAttribute('aria-posinset')).toEqual('1');
            });
        });

        describe('tab pane aria', () => {
            let navPane: any;

            beforeEach(() => {
                navPane = defaultTab.querySelector('.apto-tabs-pane');
            });

            it('should have role', () => {
                expect(navPane.getAttribute('role')).toEqual('tabpanel');
            });

            it('should have aria-labelledby index', () => {
                expect(navPane.getAttribute('aria-labelledby')).toEqual(`apto-tab-nav-${groupId}-0`);
            });

            it('should have id index', () => {
                expect(navPane.getAttribute('id')).toEqual(`apto-tab-pane-${groupId}-0`);
            });
        });
    });

    describe('toggle tabs', () => {
        let navPanes: any;
        let navItems: any;

        beforeEach(() => {
            navItems = defaultTab.querySelectorAll('.apto-tabs-nav-item');
            navPanes = defaultTab.querySelectorAll('.apto-tabs-pane');
        });

        it('should toggle', async () => {
            expect(navItems[0].className).toEqual('apto-tabs-nav-item apto-tabs-nav-item--active');
            expect(navItems[0].getAttribute('aria-selected')).toEqual('true');
            expect(navPanes[0].className).toEqual('apto-tabs-pane apto-tabs-pane--active');

            expect(navItems[1].className).toEqual('apto-tabs-nav-item');
            expect(navItems[1].getAttribute('aria-selected')).toEqual('false');
            expect(navPanes[1].className).toEqual('apto-tabs-pane');

            navItems[1].click();
            fixture.detectChanges();
            await fixture.whenStable();

            expect(navItems[1].className).toEqual('apto-tabs-nav-item apto-tabs-nav-item--active');
            expect(navItems[1].getAttribute('aria-selected')).toEqual('true');
            expect(navPanes[1].className).toEqual('apto-tabs-pane apto-tabs-pane--active');

            expect(navItems[0].className).toEqual('apto-tabs-nav-item');
            expect(navItems[0].getAttribute('aria-selected')).toEqual('false');
            expect(navPanes[0].className).toEqual('apto-tabs-pane');
        });

        it('should fire selectedTabChange', async () => {
            navItems[1].click();
            fixture.detectChanges();
            await fixture.whenStable();

            expect(testComponent.changeIncrement).toEqual(1);
        });
    });

    describe('keyboard interactions', () => {
        let nav: any;

        beforeEach(() => {
            nav = defaultTab.querySelector('.apto-tabs-nav');
        });

        it('should open last on end key', async () => {
            const e: any = new Event('keydown');
            e.keyCode = END;
            nav.dispatchEvent(e);

            fixture.detectChanges();
            await fixture.whenStable();

            expect(testComponent.componentRef.selectedIndex).toEqual(2);
        });

        it('should open first on home key', async () => {
            testComponent.componentRef.selectedIndex = 1;
            fixture.detectChanges();

            const e: any = new Event('keydown');
            e.keyCode = HOME;
            nav.dispatchEvent(e);

            fixture.detectChanges();
            await fixture.whenStable();

            expect(testComponent.componentRef.selectedIndex).toEqual(0);
        });

        it('should open next on right arrow', async () => {
            testComponent.componentRef.selectedIndex = 0;
            fixture.detectChanges();

            const e: any = new Event('keydown');
            e.keyCode = RIGHT_ARROW;
            nav.dispatchEvent(e);

            fixture.detectChanges();
            await fixture.whenStable();

            expect(testComponent.componentRef.selectedIndex).toEqual(1);
        });

        it('should open prev on left arrow', async () => {
            testComponent.componentRef.selectedIndex = 1;
            fixture.detectChanges();

            const e: any = new Event('keydown');
            e.keyCode = LEFT_ARROW;
            nav.dispatchEvent(e);

            fixture.detectChanges();
            await fixture.whenStable();

            expect(testComponent.componentRef.selectedIndex).toEqual(0);
        });
    });
});
