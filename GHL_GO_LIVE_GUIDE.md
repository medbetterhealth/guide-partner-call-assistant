# GUIDE Partner Call Assistant — Version 27 Go-Live Guide

## Final outreach stages

1. New Lead
2.a Gatekeeper Only – No Decision Maker Information
2.b Decision Maker Identified – Email Provided
2.c Decision Maker Reached – Appointment Scheduled
2.d Decision Maker Reached – Appointment Not Scheduled
2.e Not Interested
3. Meeting Held
4. Onboarding Documents Signed
5. Submitted to Medicare
6. Partner Training
7. Medicare Approved
8. Partner Onboarding Call
9. Active Partner

The five 2.a–2.e outcomes are shown inside one compact `2. Outreach Outcomes` column in the website UI.

## Important rollout order

Do not publish the new website before the five matching stages exist in the live GUIDE Partner Call Assistant pipeline. The backend retains legacy aliases as a transition safeguard, but the final configuration should use the exact names above.

## HighLevel workflows to create

Use **Automation → Workflows** and create one workflow for each 2.a–2.e stage. The trigger should be **Pipeline Stage Changed**, filtered to the **GUIDE Partner Call Assistant** pipeline and the exact stage. Add a **Send Email** action and publish the workflow.

### Workflow 2.a
Name: `GUIDE Partner - 2.a Gatekeeper Only Email`

Trigger stage: `Gatekeeper Only – No Decision Maker Information`

Recipient/contact: Gatekeeper contact email (`Partner - Answered By Email`). The backend makes the gatekeeper email the contact's primary email when this stage is selected.

Subject: `[First Name] – GUIDE Model Private Duty Partnership & Revenue Opportunity`

Body:

Hi [Gatekeeper First Name],

A member of my team recently spoke with you regarding the GUIDE Model and an opportunity for your agency to partner with MedBetterHealth.

Through this partnership, your agency can provide eligible private-duty respite care services for individuals living with dementia, and MedBetterHealth will pay your agency $34.50 per hour for those services.

Your agency provides the care and bills MedBetterHealth directly on the private-pay side. Your agency does not bill Medicare for these services.

I've attached a brief informational brochure with additional details about the GUIDE Model and how the partnership works.

If possible, please share this information with the appropriate decision maker at your agency. I would be happy to schedule a quick 15-minute call with them to explain the program, answer any questions, and discuss the partnership opportunity.

Please feel free to use my calendar link below to select a convenient time.

Looking forward to connecting.

Use Dr. Erik's existing full Outlook/image/social signature and booking link. Attach the GUIDE brochure. Do not add the Dementia Times link.

### Workflow 2.b
Name: `GUIDE Partner - 2.b Decision Maker Identified Email`

Trigger stage: `Decision Maker Identified – Email Provided`

Subject: `[First Name] – GUIDE Model Private Duty Partnership & Revenue Opportunity`

Body:

Hi [Decision Maker Name],

A member of my team recently spoke with [Gatekeeper Name] at [Agency Name], who provided your contact information regarding a potential partnership through the GUIDE Model.

MedBetterHealth is looking to partner with reliable private-duty home care agencies to provide respite care services for individuals living with dementia.

Through this partnership, MedBetterHealth will pay your agency $34.50 per hour for eligible private-duty respite care services. Your agency provides the care and bills MedBetterHealth directly on the private-pay side, so your agency does not bill Medicare for these services.

This can provide your agency with additional paid referrals and additional home care hours.

I've attached a brief informational brochure with more information about the program.

I'd love to schedule a quick 15-minute call with you to explain how the partnership works, answer your questions, and discuss the opportunity for [Agency Name].

Please select a convenient date and time using my calendar link below.

Looking forward to connecting with you.

Use Dr. Erik's existing full Outlook/image/social signature and booking link. Attach the GUIDE brochure. Do not add the Dementia Times link.

### Workflow 2.c
Name: `GUIDE Partner - 2.c Appointment Scheduled Email`

Trigger stage: `Decision Maker Reached – Appointment Scheduled`

Subject: `[First Name] – Your Upcoming GUIDE Model Partnership Meeting`

Body:

Hi [Decision Maker Name],

I understand you recently spoke with a member of my team about the GUIDE Model and MedBetterHealth's private-duty home care partnership opportunity.

I'm glad we were able to get a meeting scheduled, and I look forward to speaking with you personally.

As my team shared, MedBetterHealth can pay your agency $34.50 per hour to provide eligible private-duty respite care services for individuals living with dementia. Your agency provides the care and bills MedBetterHealth directly on the private-pay side.

I've attached our GUIDE Model informational brochure so you can review the partnership before our conversation.

I look forward to meeting with you and discussing how MedBetterHealth and [Agency Name] may be able to work together.

Talk to you soon,

Use Dr. Erik's existing full Outlook/image/social signature. Attach the GUIDE brochure. **Do not include the booking link in this workflow because the appointment is already scheduled.** Do not add the Dementia Times link.

### Workflow 2.d
Name: `GUIDE Partner - 2.d Appointment Not Scheduled Email`

Trigger stage: `Decision Maker Reached – Appointment Not Scheduled`

Subject: `[First Name] – GUIDE Model Private Duty Partnership & Revenue Opportunity`

Body:

Hi [Decision Maker Name],

I understand you recently spoke with a member of my team regarding the GUIDE Model and our private-duty home care partnership opportunity.

MedBetterHealth is looking to partner with reliable private-duty home care agencies to provide respite care services for individuals living with dementia.

Through this partnership, MedBetterHealth will pay your agency $34.50 per hour for eligible private-duty respite care services. Your agency provides the care and bills MedBetterHealth directly on the private-pay side.

I've attached a brief informational brochure with additional details about the program and partnership.

I'd be happy to speak with you personally, answer any questions you may have, and discuss how [Agency Name] could work with MedBetterHealth.

Please use my calendar link below to schedule a quick 15-minute call at a time that works best for you.

Looking forward to connecting with you.

Use Dr. Erik's existing full Outlook/image/social signature and booking link. Attach the GUIDE brochure. Do not add the Dementia Times link.

### Workflow 2.e
Name: `GUIDE Partner - 2.e Not Interested Email`

Trigger stage: `Not Interested`

Subject: `[First Name] – GUIDE Model Partnership Information`

Body:

Hi [First Name],

I understand you recently spoke with a member of my team regarding MedBetterHealth's GUIDE Model private-duty home care partnership opportunity.

I understand that this may not be the right opportunity for your agency at this time.

I've attached our informational brochure for your reference. If anything changes in the future, or if you would like to learn more about the opportunity for agencies to receive $34.50 per hour for eligible private-duty respite care services, we would be happy to reconnect.

Thank you for your time and consideration.

Use Dr. Erik's existing full Outlook/image/social signature. No booking link is necessary. Do not add the Dementia Times link.

## Test checklist before public publish

1. Create one test lead with a gatekeeper email only and move it to 2.a. Confirm only the gatekeeper receives the 2.a email.
2. Create one test lead with gatekeeper + decision-maker email and move it to 2.b. Confirm the decision maker receives the 2.b email and the gatekeeper name merges correctly.
3. Move a decision-maker test lead to 2.c. Confirm the scheduled email sends and contains no booking link.
4. Move a decision-maker test lead to 2.d. Confirm the booking link is present.
5. Move a test lead to 2.e. Confirm the short not-interested email sends.
6. Confirm every email comes from Dr. Erik's connected Outlook account, has the GUIDE brochure, and uses the full signature.
7. Confirm no email contains `today`, `Dementia Times`, or wording that says Dr. Erik personally made the initial outreach call.
8. Confirm moving a lead in the website also moves the same opportunity in the GUIDE pipeline.
9. Confirm another pipeline is unchanged.

## Website deployment

After the HighLevel stages/workflows are ready, commit the code and publish the Site. The public website should be the last step so users cannot move leads into a stage whose workflow does not yet exist.

## FINAL STABILIZATION SETTINGS (Version 27.1)

For EACH of the five GUIDE outreach email workflows, verify the Send Email action uses:

- Sender: the already-connected Dr. Erik Outlook account (do not reconnect or replace it)
- CC: GuideTeam2@medbetterhealth.org
- Signature: reuse the existing full Dr. Erik graphical/social signature, including all existing social-media icons/links
- Attachment: the existing GUIDE brochure PDF
- Dementia Times: removed everywhere
- Booking URL: use the existing Dr. Erik booking link for Gatekeeper Only, Decision Maker Identified, and Appointment Not Scheduled
- Appointment Scheduled: do not add a second booking CTA
- Not Interested: no booking CTA required

Do not replace the graphical Outlook/GHL signature with the plain fallback signature in source code. The live GHL workflow signature is the source of truth.

### Final five-stage order

1. New Lead
2.a Gatekeeper Only – No Decision Maker Information
2.b Decision Maker Identified – Email Provided
2.c Decision Maker Reached – Appointment Not Scheduled
2.d Decision Maker Reached – Appointment Scheduled
2.e Not Interested
3. Meeting Held
4. Onboarding Documents Signed
5. Submitted to Medicare
6. Partner Training
7. Medicare Approved
8. Partner Onboarding Call
9. Active Partner

### Important checkbox fix

The "The person who answered is the decision maker" checkbox is now non-destructive. It only fills missing Decision Maker fields from Gatekeeper/Agency information. It never clears or overwrites Decision Maker information that has already been typed.

### Email-route safety

The UI now requires an explicit Call Outcome / Email Route before submission. It also blocks a route when the required recipient email is missing. The backend repeats the recipient validation so a direct API call cannot accidentally move an opportunity into an email-triggering stage with no recipient.

### Calendar safety

The assistant uses GHL_CALENDAR_URL when configured. Otherwise it looks up the active Dr. Erik calendar in GoHighLevel. If neither is available, the UI shows an error instead of opening a broken scheduling link.
