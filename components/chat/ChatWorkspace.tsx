'use client';

import { useEffect, useState } from 'react';
import { CaseHistoryPanel } from './CaseHistoryPanel';
import { CaseSidebar } from './CaseSidebar';
import { CaseSnapshot } from './CaseSnapshot';
import { ConfirmationCard } from './ConfirmationCard';
import { ConversationPanel } from './ConversationPanel';
import { CustomerLoader } from './CustomerLoader';
import { ReturnSummaryCard } from './ReturnSummaryCard';
import { getCaseInsights, getNaturalAiReply } from '@/lib/ai';
import { toCustomerWorkflowCase } from '@/lib/serializers';
import {
  getWorkspaceErrorMessage,
  loadCustomerCase,
  loadCustomerWorkspace,
  saveCustomerWorkspace,
  startNewCustomerCase
} from '@/lib/customerFileClient';
import {
  buildReturnSummary,
  buildSummary,
  confirmCase,
  processCustomerMessage
} from '@/lib/caseLogic';
import {
  createMessage,
  getFallbackReply,
  getFieldLabel,
  nowIso
} from '@/lib/helpers';
import { validateProfileInput } from '@/lib/validation';
import type { AIActionType, CaseRecord, CustomerProfile, CustomerVisibleFile, ReturnSummary } from '@/lib/types';

export function ChatWorkspace() {
  const [customerId, setCustomerId] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [customerFile, setCustomerFile] = useState<CustomerVisibleFile | null>(null);
  const [welcomeBackNotice, setWelcomeBackNotice] = useState('');
  const [returnSummary, setReturnSummary] = useState<ReturnSummary | null>(null);
  const [workspaceError, setWorkspaceError] = useState('');
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [isReplying, setIsReplying] = useState(false);
  const [isLoadingCase, setIsLoadingCase] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapWorkspace() {
      try {
        setIsLoadingWorkspace(true);
        const { file, existed } = await loadCustomerWorkspace();
        if (cancelled) return;

        hydrateCustomerForm(file);
        setCustomerFile(file);
        setWelcomeBackNotice(getWelcomeNotice(file, existed));
        setReturnSummary(existed ? buildReturnSummary(file.profile, toCustomerWorkflowCase(file.activeCase)) : null);
        setWorkspaceError('');
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setWorkspaceError(getWorkspaceErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingWorkspace(false);
        }
      }
    }

    void bootstrapWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  function hydrateCustomerForm(file: CustomerVisibleFile) {
    setCustomerId(file.profile.customerId);
    setNameInput(file.profile.name);
    setPhoneInput(file.profile.phone);
    setEmailInput(file.profile.email);
  }

  function getProfileSnapshot(): CustomerProfile {
    return {
      customerId: customerId.trim(),
      name: nameInput.trim(),
      phone: phoneInput.trim(),
      email: emailInput.trim(),
      lastSeenAt: nowIso()
    };
  }

  function validateProfile() {
    return validateProfileInput({
      email: emailInput.trim(),
      phone: phoneInput.trim()
    });
  }

  async function persist(updatedFile: CustomerVisibleFile) {
    const { file } = await saveCustomerWorkspace(updatedFile);
    setCustomerFile(file);
    setReturnSummary(null);
    setWorkspaceError('');
  }

  function getWelcomeNotice(file: CustomerVisibleFile, existed: boolean) {
    if (!existed) return '';

    const hasSavedCaseData =
      file.cases.length > 1 ||
      file.activeCase.messages.length > 1 ||
      Object.values(file.activeCase.collectedFields).some((value) => value && value.trim() !== '');

    if (!hasSavedCaseData) return '';

    return 'Welcome back. Your previous case details and support history have been saved, so you do not need to re-enter everything.';
  }

  async function handleLoadCustomer() {
    const profileError = validateProfile();
    if (profileError) {
      setWorkspaceError(profileError);
      return;
    }

    try {
      setIsLoadingWorkspace(true);

      const { file, existed } = await loadCustomerWorkspace({
        name: nameInput.trim(),
        phone: phoneInput.trim(),
        email: emailInput.trim()
      });

      hydrateCustomerForm(file);
      setCustomerFile(file);
      setWelcomeBackNotice(getWelcomeNotice(file, existed));
      setReturnSummary(existed ? buildReturnSummary(file.profile, toCustomerWorkflowCase(file.activeCase)) : null);
      setWorkspaceError('');
      setChatInput('');
    } catch (error) {
      console.error(error);
      setWorkspaceError(getWorkspaceErrorMessage(error));
    } finally {
      setIsLoadingWorkspace(false);
    }
  }

  async function handleStartFreshCaseFromWorkspace() {
    try {
      setIsLoadingWorkspace(true);

      const { file } = await startNewCustomerCase({
        name: nameInput.trim(),
        phone: phoneInput.trim(),
        email: emailInput.trim()
      });

      hydrateCustomerForm(file);
      setCustomerFile(file);
      setWelcomeBackNotice('');
      setReturnSummary(null);
      setWorkspaceError('');
      setChatInput('');
    } catch (error) {
      console.error(error);
      setWorkspaceError(getWorkspaceErrorMessage(error));
    } finally {
      setIsLoadingWorkspace(false);
    }
  }

  async function handleSelectCase(caseId: string) {
    if (!customerFile || customerFile.activeCase.caseId === caseId) return;

    try {
      setIsLoadingCase(true);
      const { file } = await loadCustomerCase(caseId);
      hydrateCustomerForm(file);
      setCustomerFile(file);
      setReturnSummary(null);
      setWelcomeBackNotice('');
      setWorkspaceError('');
      setChatInput('');
    } catch (error) {
      console.error(error);
      setWorkspaceError(getWorkspaceErrorMessage(error, 'We could not load that saved case right now.'));
    } finally {
      setIsLoadingCase(false);
    }
  }

  async function appendAiReply(
    updatedCase: CaseRecord,
    latestCustomerMessage: string,
    actionType: AIActionType
  ) {
    const profile = getProfileSnapshot();
    const reply = await getNaturalAiReply({
      actionType,
      customerName: profile.name,
      customerId: profile.customerId,
      issueType: updatedCase.issueType ?? 'Unknown',
      stage: updatedCase.stage,
      status: updatedCase.status,
      escalationState: updatedCase.escalationState,
      handoffStatus: updatedCase.handoffStatus,
      priority: updatedCase.priority,
      assignedTo: null,
      assignedHumanAgent: updatedCase.assignedHumanAgent,
      etaOrExpectedUpdateTime: updatedCase.etaOrExpectedUpdateTime,
      internalNote: '',
      resolutionNote: updatedCase.resolutionNote,
      problemStatement: updatedCase.problemStatement,
      summary: updatedCase.summary,
      nextAction: updatedCase.nextAction,
      pendingFieldLabel: updatedCase.pendingField ? getFieldLabel(updatedCase.pendingField) : null,
      collectedFields: updatedCase.collectedFields as Record<string, string>,
      latestCustomerMessage,
      recentMessages: updatedCase.messages.slice(-8).map((message) => ({
        sender: message.sender,
        text: message.text,
        agentLabel: message.agentLabel
      }))
    });

    return {
      ...updatedCase,
      messages: [...updatedCase.messages, createMessage('ai', reply || getFallbackReply(actionType))]
    };
  }

  async function enrichCaseWithAi(caseRecord: CaseRecord, profile: CustomerProfile) {
    const insights = await getCaseInsights({
      customerName: profile.name,
      customerId: profile.customerId,
      issueType: caseRecord.issueType ?? 'Unknown',
      stage: caseRecord.stage,
      status: caseRecord.status,
      escalationState: caseRecord.escalationState,
      handoffStatus: caseRecord.handoffStatus,
      priority: caseRecord.priority,
      assignedTo: null,
      assignedHumanAgent: caseRecord.assignedHumanAgent,
      etaOrExpectedUpdateTime: caseRecord.etaOrExpectedUpdateTime,
      problemStatement: caseRecord.problemStatement,
      summary: caseRecord.summary,
      nextAction: caseRecord.nextAction,
      resolutionNote: caseRecord.resolutionNote,
      internalNote: '',
      collectedFields: caseRecord.collectedFields as Record<string, string>,
      recentMessages: caseRecord.messages.slice(-10).map((message) => ({
        sender: message.sender,
        text: message.text,
        agentLabel: message.agentLabel
      }))
    });

    return {
      ...caseRecord,
      summary: insights.summary || buildSummary(profile, caseRecord as CaseRecord),
      customerUpdate: insights.customerUpdate || caseRecord.customerUpdate
    };
  }

  async function handleSend() {
    if (!chatInput.trim() || !customerFile || isReplying || !customerFile.activeCase.isOpen) return;

    setIsReplying(true);

    try {
      const input = chatInput.trim();
      const profile = getProfileSnapshot();
      const { updatedCase: progressedCase, actionType } = processCustomerMessage(
        toCustomerWorkflowCase(customerFile.activeCase),
        input
      );

      progressedCase.summary = buildSummary(profile, progressedCase);

      const caseWithReply = await appendAiReply(progressedCase, input, actionType);
      const enrichedCase = await enrichCaseWithAi(caseWithReply, profile);

      await persist({
        profile,
        activeCase: {
          ...enrichedCase,
          updatedAt: nowIso()
        },
        cases: customerFile.cases
      });

      setChatInput('');
      setWelcomeBackNotice('');
    } catch (error) {
      console.error(error);
      setWorkspaceError(getWorkspaceErrorMessage(error, 'We could not save the latest case update. Please try again.'));
    } finally {
      setIsReplying(false);
    }
  }

  async function handleConfirmCase() {
    if (!customerFile) return;

    try {
      const profile = getProfileSnapshot();
      const confirmedCase = confirmCase(toCustomerWorkflowCase(customerFile.activeCase));
      confirmedCase.summary = buildSummary(profile, confirmedCase);
      confirmedCase.messages = [
        ...confirmedCase.messages,
        createMessage(
          'ai',
          `Your case has now been officially recorded. Status: ${confirmedCase.status}. Next, we’ll ${confirmedCase.nextAction.charAt(0).toLowerCase()}${confirmedCase.nextAction.slice(1)}`
        )
      ];

      const enrichedCase = await enrichCaseWithAi(confirmedCase, profile);

      await persist({
        profile,
        activeCase: enrichedCase,
        cases: customerFile.cases
      });
    } catch (error) {
      console.error(error);
      setWorkspaceError(getWorkspaceErrorMessage(error, 'We could not confirm the case right now.'));
    }
  }

  async function handleStartNewCase() {
    if (!customerFile) return;

    try {
      const profile = getProfileSnapshot();
      const { file } = await startNewCustomerCase(profile);

      hydrateCustomerForm(file);
      setCustomerFile(file);
      setReturnSummary(null);
      setWelcomeBackNotice('');
      setWorkspaceError('');
      setChatInput('');
    } catch (error) {
      console.error(error);
      setWorkspaceError(getWorkspaceErrorMessage(error, 'We could not start a new case right now.'));
    }
  }

  if (!customerFile) {
    return (
      <main className="chat-shell">
        <div className="loading-card">
          {isLoadingWorkspace ? 'Loading support workspace...' : workspaceError || 'No support workspace is available.'}
        </div>
      </main>
    );
  }

  const humanSupportHref = customerFile.activeCase.isOpen
    ? `/human-support?caseId=${encodeURIComponent(customerFile.activeCase.caseId)}`
    : undefined;

  return (
    <main className="chat-shell">
      <section className="hero-banner">
        <div>
          <p className="eyebrow">LC AI Support</p>
          <h1>Persistent-memory router support that behaves like a real case desk.</h1>
          <p>
            This workspace keeps workflow control in application code, stores customer memory in Supabase, and uses
            OpenAI only to improve wording, summaries, and progress updates.
          </p>
        </div>
      </section>

      {welcomeBackNotice && <section className="welcome-notice">{welcomeBackNotice}</section>}
      {workspaceError && <section className="error-notice">{workspaceError}</section>}

      <section className="dashboard-grid">
        <div className="left-column">
          <CustomerLoader
            customerId={customerId}
            name={nameInput}
            phone={phoneInput}
            email={emailInput}
            onNameChange={setNameInput}
            onPhoneChange={setPhoneInput}
            onEmailChange={setEmailInput}
            onLoad={handleLoadCustomer}
            onStartFreshCase={handleStartFreshCaseFromWorkspace}
          />

          <CaseHistoryPanel
            cases={customerFile.cases.map(toCustomerWorkflowCase)}
            activeCaseId={customerFile.activeCase.caseId}
            onSelectCase={handleSelectCase}
          />
        </div>

        <div className="center-column">
          {returnSummary && <ReturnSummaryCard title={returnSummary.title} detail={returnSummary.detail} />}

          {isLoadingCase && <div className="loading-card">Loading the selected case...</div>}

          <CaseSnapshot caseRecord={toCustomerWorkflowCase(customerFile.activeCase)} humanSupportHref={humanSupportHref} />

          <ConversationPanel
            messages={customerFile.activeCase.messages}
            input={chatInput}
            isReplying={isReplying}
            isReadonly={!customerFile.activeCase.isOpen}
            humanSupportHref={humanSupportHref}
            onInputChange={setChatInput}
            onSend={handleSend}
            onDemoMessage={setChatInput}
          />

          {customerFile.activeCase.stage === 'case_confirmation' && customerFile.activeCase.isOpen && (
            <ConfirmationCard
              customer={customerFile.profile}
              caseRecord={toCustomerWorkflowCase(customerFile.activeCase)}
              onConfirm={handleConfirmCase}
              onStartNew={handleStartNewCase}
            />
          )}
        </div>

        <div className="right-column">
          <CaseSidebar customer={customerFile.profile} caseRecord={toCustomerWorkflowCase(customerFile.activeCase)} />
        </div>
      </section>
    </main>
  );
}
