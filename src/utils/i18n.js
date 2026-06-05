const translations = {
  en: {
    'notifications.newLoad': 'New Load Created',
    'notifications.newLoadCreated': 'Load #{loadNumber} from {pickup} to {dropoff} has been created',
    'notifications.loadAssigned': 'New Load Assigned',
    'notifications.loadAssignedToYou': 'You have been assigned load #{loadNumber} from {pickup} to {dropoff}',
    'notifications.loadAccepted': 'Load Accepted',
    'notifications.driverAcceptedLoadDetails': '{driverName} accepted load #{loadNumber} ({pickup} → {dropoff})',
    'notifications.loadRejected': 'Load Rejected',
    'notifications.driverRejectedLoadDetails': '{driverName} rejected load #{loadNumber} ({pickup} → {dropoff})',
    'notifications.loadCompleted': 'Load Completed',
    'notifications.driverCompletedLoadDetails': '{driverName} completed load #{loadNumber} ({pickup} → {dropoff})',
    'notifications.loadInTransit': 'Load In Transit',
    'notifications.driverStartedLoadJourney': '{driverName} has started the journey for load #{loadNumber}',
    'notifications.documentsUploaded': 'Documents Uploaded',
    'notifications.driverUploadedDocumentsDetails': '{driverName} uploaded documents for load #{loadNumber} ({pickup} → {dropoff})',
    'notifications.routeAssigned': 'New Route Assigned',
    'notifications.routeAssignedToYou': 'You have been assigned to route: {routeName}',
    'notifications.routeAccepted': 'Route Accepted',
    'notifications.driverAcceptedRoute': '{driverName} accepted route: {routeName}',
    'notifications.routeRejected': 'Route Rejected',
    'notifications.driverRejectedRoute': '{driverName} rejected route: {routeName}',
    'notifications.routeDocumentsUploaded': 'Route Documents Uploaded',
    'notifications.driverUploadedRouteDocumentsDetails': '{driverName} has uploaded documents for route: {routeName} (#{routeNumber})',
    'email.driverInvitation.subject': 'Welcome to TruckFlow - Set Your Password',
    'email.driverInvitation.title': 'Welcome to TruckFlow!',
    'email.driverInvitation.intro': 'You\'ve been added as a driver to TruckFlow. To get started, please set your password by clicking the button below:',
    'email.passwordReset.subject': 'Password Reset OTP - TruckFlow',
    'email.passwordReset.title': 'Password Reset Request',
    'email.passwordReset.intro': 'We received a request to reset your password. Use the OTP below to reset your password:',
    'email.load.subject_assigned': 'New Load Assigned: #{loadNumber}',
    'email.load.title_assigned': 'New Load Assigned',
    'email.load.intro_assigned': 'You have been assigned a new load: <strong>#{loadNumber}</strong>.',
    'email.load.subject_accepted': 'Load Accepted: #{loadNumber}',
    'email.load.title_accepted': 'Load Accepted',
    'email.load.intro_accepted': 'Driver <strong>{userName}</strong> has accepted load <strong>#{loadNumber}</strong>.',
    'email.load.subject_rejected': 'Load Rejected: #{loadNumber}',
    'email.load.title_rejected': 'Load Rejected',
    'email.load.intro_rejected': 'Driver <strong>{userName}</strong> has rejected load <strong>#{loadNumber}</strong>.',
    'email.load.subject_completed': 'Load Completed: #{loadNumber}',
    'email.load.title_completed': 'Load Completed',
    'email.load.intro_completed': 'Driver <strong>{userName}</strong> has successfully completed load <strong>#{loadNumber}</strong>.',
    'email.load.subject_documents_uploaded': 'Documents Uploaded: #{loadNumber}',
    'email.load.title_documents_uploaded': 'Documents Uploaded',
    'email.load.intro_documents_uploaded': '{userName} has uploaded documents for load #{loadNumber}.',
    'email.route.subject_assigned': 'New Route Assigned: {routeName}',
    'email.route.title_assigned': 'New Route Assignment',
    'email.route.intro_assigned': 'You have been assigned to a new route: {routeName}.',
    'email.route.subject_accepted': 'Route Accepted: {routeName}',
    'email.route.title_accepted': 'Route Accepted',
    'email.route.intro_accepted': '{driverName} has accepted the route: {routeName}.',
    'email.route.subject_rejected': 'Route Rejected: {routeName}',
    'email.route.title_rejected': 'Route Rejected',
    'email.route.intro_rejected': '{driverName} has rejected the route: {routeName}.',
    'email.route.subject_documents_uploaded': 'Route Documents Uploaded: {routeName}',
    'email.route.title_documents_uploaded': 'Route Documents Uploaded',
    'email.route.intro_documents_uploaded': '{driverName} has uploaded documents for route: {routeName}.',
  },
  el: {
    'notifications.newLoad': 'Νέο Φορτίο Δημιουργήθηκε',
    'notifications.newLoadCreated': 'Το φορτίο #{loadNumber} από {pickup} προς {dropoff} δημιουργήθηκε',
    'notifications.loadAssigned': 'Νέο Φορτίο Ανατέθηκε',
    'notifications.loadAssignedToYou': 'Σας ανατέθηκε το φορτίο #{loadNumber} από {pickup} προς {dropoff}',
    'notifications.loadAccepted': 'Φορτίο Αποδεκτό',
    'notifications.driverAcceptedLoadDetails': 'Ο/Η {driverName} αποδέχτηκε το φορτίο #{loadNumber} ({pickup} → {dropoff})',
    'notifications.loadRejected': 'Φορτίο Απορρίφθηκε',
    'notifications.driverRejectedLoadDetails': 'Ο/Η {driverName} απέρριψε το φορτίο #{loadNumber} ({pickup} → {dropoff})',
    'notifications.loadCompleted': 'Φορτίο Ολοκληρώθηκε',
    'notifications.driverCompletedLoadDetails': 'Ο/Η {driverName} ολοκλήρωσε το φορτίο #{loadNumber} ({pickup} → {dropoff})',
    'notifications.loadInTransit': 'Φορτίο σε εξέλιξη',
    'notifications.driverStartedLoadJourney': 'Ο/Η {driverName} ξεκίνησε τη διαδρομή για το φορτίο #{loadNumber}',
    'notifications.documentsUploaded': 'Έγγραφα Ανέβηκαν',
    'notifications.driverUploadedDocumentsDetails': 'Ο/Η {driverName} ανέβασε έγγραφα για το φορτίο #{loadNumber} ({pickup} → {dropoff})',
    'notifications.routeAssigned': 'Νέα Διαδρομή Ανατέθηκε',
    'notifications.routeAssignedToYou': 'Σας ανατέθηκε η διαδρομή: {routeName}',
    'notifications.routeAccepted': 'Διαδρομή Αποδεκτή',
    'notifications.driverAcceptedRoute': 'Ο/Η {driverName} αποδέχτηκε τη διαδρομή: {routeName}',
    'notifications.routeRejected': 'Απόρριψη Διαδρομής',
    'notifications.driverRejectedRoute': 'Ο οδηγός {driverName} απέρριψε τη διαδρομή: {routeName}',
    'notifications.routeDocumentsUploaded': 'Μεταφόρτωση Εγγράφων Διαδρομής',
    'notifications.driverUploadedRouteDocumentsDetails': 'Ο οδηγός {driverName} ανέβασε έγγραφα για τη διαδρομή: {routeName} (#{routeNumber})',
    'email.driverInvitation.subject': 'Καλώς ήρθατε στο TruckFlow - Ορίστε τον κωδικό σας',
    'email.driverInvitation.title': 'Καλώς ήρθατε στο TruckFlow!',
    'email.driverInvitation.intro': 'Έχετε προστεθεί ως οδηγός στο TruckFlow. Για να ξεκινήσετε, παρακαλώ ορίστε τον κωδικό σας κάνοντας κλικ στο παρακάτω κουμπί:',
    'email.passwordReset.subject': 'OTP Επαναφοράς Κωδικού - TruckFlow',
    'email.passwordReset.title': 'Αίτημα Επαναφοράς Κωδικού',
    'email.passwordReset.intro': 'Λάβαμε ένα αίτημα για επαναφορά του κωδικού σας. Χρησιμοποιήστε το παρακάτω OTP για να επαναφέρετε τον κωδικό σας:',
    'email.load.subject_assigned': 'Ανάθεση Νέου Φορτίου: #{loadNumber}',
    'email.load.title_assigned': 'Νέο Φορτίο Ανατέθηκε',
    'email.load.intro_assigned': 'Σας ανατέθηκε ένα νέο φορτίο: <strong>#{loadNumber}</strong>.',
    'email.load.subject_accepted': 'Φορτίο Αποδεκτό: #{loadNumber}',
    'email.load.title_accepted': 'Φορτίο Αποδεκτό',
    'email.load.intro_accepted': 'Ο οδηγός <strong>{userName}</strong> αποδέχτηκε το φορτίο <strong>#{loadNumber}</strong>.',
    'email.load.subject_rejected': 'Φορτίο Απορρίφθηκε: #{loadNumber}',
    'email.load.title_rejected': 'Φορτίο Απορρίφθηκε',
    'email.load.intro_rejected': 'Ο οδηγός <strong>{userName}</strong> απέρριψε το φορτίο <strong>#{loadNumber}</strong>.',
    'email.load.subject_completed': 'Φορτίο Ολοκληρώθηκε: #{loadNumber}',
    'email.load.title_completed': 'Φορτίο Ολοκληρώθηκε',
    'email.load.intro_completed': 'Ο οδηγός <strong>{userName}</strong> ολοκλήρωσε επιτυχώς το φορτίο <strong>#{loadNumber}</strong>.',
    'email.load.subject_documents_uploaded': 'Έγγραφα Ανέβηκαν: #{loadNumber}',
    'email.load.title_documents_uploaded': 'Έγγραφα Ανέβηκαν',
    'email.load.intro_documents_uploaded': 'Ο οδηγός {userName} ανέβασε έγγραφα για το φορτίο #{loadNumber}.',
    'email.route.subject_assigned': 'Ανάθεση Νέας Διαδρομής: {routeName}',
    'email.route.title_assigned': 'Ανάθεση Νέας Διαδρομής',
    'email.route.intro_assigned': 'Σας έχει ανατεθεί μια νέα διαδρομή: {routeName}.',
    'email.route.subject_accepted': 'Αποδοχή Διαδρομής: {routeName}',
    'email.route.title_accepted': 'Αποδοχή Διαδρομής',
    'email.route.intro_accepted': 'Ο οδηγός {driverName} αποδέχτηκε τη διαδρομή: {routeName}.',
    'email.route.subject_rejected': 'Απόρριψη Διαδρομής: {routeName}',
    'email.route.title_rejected': 'Απόρριψη Διαδρομής',
    'email.route.intro_rejected': 'Ο οδηγός {driverName} απέρριψε τη διαδρομή: {routeName}.',
    'email.route.subject_documents_uploaded': 'Μεταφόρτωση Εγγράφων Διαδρομής: {routeName}',
    'email.route.title_documents_uploaded': 'Μεταφόρτωση Εγγράφων Διαδρομής',
    'email.route.intro_documents_uploaded': 'Ο οδηγός {driverName} ανέβασε έγγραφα για τη διαδρομή: {routeName}.',
  }
};

/**
 * Translate a key into the specified language
 * @param {string} key - The translation key (e.g., 'notifications.newLoad')
 * @param {string} lang - Language code ('en', 'el')
 * @param {Object} params - Dynamic parameters (e.g., { loadNumber: '123' })
 * @returns {string} - Translated and interpolated string
 */
const t = (key, lang = 'en', params = {}) => {
  const language = translations[lang] || translations['en'];
  let message = language[key] || translations['en'][key] || key;

  // Replace parameters like {loadNumber}, {pickup}, etc.
  Object.keys(params).forEach(param => {
    const value = params[param];
    const regex = new RegExp(`{${param}}`, 'g');
    message = message.replace(regex, value);
  });

  return message;
};
/**
 * Middleware to detect language from request
 */
const languageMiddleware = (req, res, next) => {
  // 1. Check for Accept-Language header
  let lang = req.headers['accept-language'] || 'en';
  
  // Clean up language string (e.g., 'el,en-US;q=0.9,en;q=0.8' -> 'el')
  if (lang.includes(',')) {
    lang = lang.split(',')[0];
  }
  if (lang.includes('-')) {
    lang = lang.split('-')[0];
  }
  
  // 2. If user is logged in, they might have a preference in their profile
  // Note: auth middleware runs later, so we check if req.user exists just in case
  if (req.user && req.user.preferredLanguage) {
    lang = req.user.preferredLanguage;
  }

  // Ensure we support the language, default to en
  if (!['en', 'el'].includes(lang)) {
    lang = 'en';
  }

  req.language = lang;
  
  // ✅ ADD THIS - Attach translate function to request
  req.t = (key, params = {}) => {
    return t(key, req.language, params);
  };
  
  next();
};
module.exports = { t, languageMiddleware };
