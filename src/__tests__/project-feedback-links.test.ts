import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import type { App, Component } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import PrimeVue from 'primevue/config';
import messages from '../i18n';
import { PROJECT_ISSUES_URL, PROJECT_REPO_URL, buildIssueReportUrl } from 'src/utils/project-links';
import TabletNavRail from 'src/components/layout/TabletNavRail.vue';
import AppSideMenu from 'src/components/layout/AppSideMenu.vue';
import AboutSection from 'src/components/settings/AboutSection.vue';

const ISSUE_NEW_PREFIX = 'https://github.com/rozx/Tsukuyomi/issues/new';

function issueBody(url: string): string {
  return new URL(url).searchParams.get('body') ?? '';
}

describe('buildIssueReportUrl', () => {
  it('指向仓库的新建 issue 页面', () => {
    expect(PROJECT_REPO_URL).toBe('https://github.com/rozx/Tsukuyomi');
    expect(PROJECT_ISSUES_URL).toBe('https://github.com/rozx/Tsukuyomi/issues');
    const url = buildIssueReportUrl({ version: '1.2.3', platform: 'Web' });
    expect(url.startsWith(`${ISSUE_NEW_PREFIX}?`)).toBe(true);
  });

  it('正文预填版本号与运行平台', () => {
    const body = issueBody(
      buildIssueReportUrl({ version: '0.18.1.1532 (0fa51f9)', platform: 'Desktop (Electron)' }),
    );
    expect(body).toContain('- Version: 0.18.1.1532 (0fa51f9)');
    expect(body).toContain('- Platform: Desktop (Electron)');
  });

  it('提供 userAgent 时追加一行，未提供时不输出空行', () => {
    const withUa = issueBody(
      buildIssueReportUrl({ version: '1.0.0', platform: 'Web', userAgent: 'Mozilla/5.0 Test' }),
    );
    expect(withUa).toContain('- User agent: Mozilla/5.0 Test');

    const withoutUa = issueBody(buildIssueReportUrl({ version: '1.0.0', platform: 'Web' }));
    expect(withoutUa).not.toContain('User agent');
  });

  it('提示文字以 HTML 注释形式放在正文开头，提交后不显示', () => {
    const body = issueBody(
      buildIssueReportUrl({ version: '1.0.0', platform: 'Web', hint: '请描述问题' }),
    );
    expect(body.startsWith('<!-- 请描述问题 -->')).toBe(true);
  });

  it('提示文字中的注释结束符会被拆开，避免提前闭合注释', () => {
    const body = issueBody(
      buildIssueReportUrl({ version: '1.0.0', platform: 'Web', hint: 'a --> b' }),
    );
    expect(body.split('-->').length).toBe(2);
  });

  it('空格编码为 %20 而非 +', () => {
    const url = buildIssueReportUrl({ version: '1.0.0', platform: 'Desktop (Electron)' });
    expect(url).not.toContain('+');
    expect(url).toContain('%20');
  });
});

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
});

async function mount(component: Component, props: Record<string, unknown> = {}, locale = 'zh-CN') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
  });
  await router.push('/');
  app = createApp({ setup: () => () => h(component, props) });
  app
    .use(createPinia())
    .use(createI18n({ legacy: false, locale, messages }))
    .use(router)
    .use(PrimeVue)
    .mount(document.body.appendChild(document.createElement('div')));
  await nextTick();
}

function findIssueLink(): HTMLAnchorElement | null {
  return document.querySelector<HTMLAnchorElement>(`a[href^="${ISSUE_NEW_PREFIX}"]`);
}

describe('反馈问题入口', () => {
  it('平板导航栏在帮助 / 设置旁提供外链入口', async () => {
    await mount(TabletNavRail);
    const link = findIssueLink();
    expect(link).not.toBeNull();
    expect(link!.target).toBe('_blank');
    expect(link!.rel).toContain('noopener');
    expect(link!.getAttribute('aria-label')).toBe('反馈问题');
  });

  it('桌面侧边栏（展开）底部菜单包含反馈问题外链', async () => {
    await mount(AppSideMenu, { collapsed: false });
    const link = findIssueLink();
    expect(link).not.toBeNull();
    expect(link!.target).toBe('_blank');
    expect(link!.closest('.side-nav-foot')).not.toBeNull();
    expect(link!.textContent).toContain('反馈问题');
  });

  it('桌面侧边栏（折叠）图标栏包含反馈问题外链', async () => {
    await mount(AppSideMenu, { collapsed: true });
    const link = findIssueLink();
    expect(link).not.toBeNull();
    expect(link!.target).toBe('_blank');
    expect(link!.getAttribute('aria-label')).toBe('反馈问题');
  });

  it('入口文案与预填提示随界面语言切换', async () => {
    await mount(TabletNavRail, {}, 'en-US');
    const link = findIssueLink()!;
    expect(link.getAttribute('aria-label')).toBe('Report an issue');
    const body = issueBody(link.href);
    expect(body).toContain('<!-- Describe the problem');
    expect(body).toContain('- Version: ');
    expect(body).toContain('- Platform: Web');
  });
});

describe('关于页', () => {
  it('提供反馈问题链接与 Star 引导', async () => {
    await mount(AboutSection);
    const issue = findIssueLink();
    expect(issue).not.toBeNull();
    expect(issue!.target).toBe('_blank');

    const star = document.querySelector<HTMLAnchorElement>('.about-star a');
    expect(star).not.toBeNull();
    expect(star!.href).toBe(`${PROJECT_REPO_URL}`);
    expect(star!.target).toBe('_blank');
    expect(document.querySelector('.about-star')!.textContent).toContain('Star');
  });
});
